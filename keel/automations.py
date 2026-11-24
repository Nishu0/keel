"""Starting runs without a person clicking: schedules and inbound triggers."""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from typing import Any

from croniter import croniter

from keel.accounts.billing import usage_this_month
from keel.accounts.plans import limits
from keel.accounts.store import AccountStore
from keel.core.agent import AgentConfig
from keel.core.events import Event, EventType, utcnow
from keel.core.ids import new_id
from keel.store.base import RunDoc, Store

log = logging.getLogger("keel.automations")
FIELD = re.compile(r"\{([a-zA-Z0-9_.]+)\}")
MAX_TASK = 8_000


class AutomationError(ValueError):
    pass


def next_fire(cron: str, after: datetime) -> datetime:
    if not croniter.is_valid(cron):
        raise AutomationError("cron needs five fields, like 0 9 * * 1-5 for weekdays at 09:00 utc")
    return croniter(cron, after.astimezone(UTC)).get_next(datetime)


async def quota_problem(accounts: AccountStore, store: Store, org_id: str) -> str | None:
    org = await accounts.get_org(org_id)
    if org is None:
        return None
    lim = limits(org.plan)
    used = await usage_this_month(store, org_id)
    if used.runs >= lim.runs_per_month:
        return f"monthly runs on the {org.plan} plan are used up"
    if used.tokens >= lim.tokens_per_month:
        return f"monthly tokens on the {org.plan} plan are used up"
    return None


async def start_run(store: Store, org_id: str, agent: AgentConfig, task: str, by: str) -> RunDoc:
    run = RunDoc(
        id=new_id("run"), org_id=org_id, agent_id=agent.id, input={"task": task}, agent_version=agent.version
    )
    await store.create_run(run)
    await store.append(
        Event(
            org_id=org_id,
            run_id=run.id,
            seq=1,
            type=EventType.RUN_CREATED,
            payload={"input": run.input, "agent_version": agent.version, "by": by},
        ),
        None,
    )
    return run


async def fire_due(accounts: AccountStore, store: Store, now: datetime | None = None) -> list[str]:
    """Start a run for every schedule that's due. Safe to call from many workers at
    once: each due time is claimed by moving next_run_at forward, which only one wins."""
    now = now or utcnow()
    fired: list[str] = []
    for s in await accounts.due_schedules(now):
        try:
            nxt = next_fire(s.cron, now)
        except AutomationError:
            continue
        if not await accounts.advance_schedule(s.id, s.next_run_at, nxt, "pending"):
            continue  # another worker took this one
        agent = await store.get_agent(s.org_id, s.agent_id)
        if agent is None:
            log.warning("schedule %s points at a missing agent; skipping", s.id)
            continue
        if problem := await quota_problem(accounts, store, s.org_id):
            log.info("schedule %s skipped: %s", s.id, problem)
            continue
        run = await start_run(store, s.org_id, agent, s.task, f"schedule:{s.id}")
        await accounts.put_schedule(s.model_copy(update={"next_run_at": nxt, "last_run_id": run.id}))
        fired.append(run.id)
    return fired


def fill(template: str, body: Any) -> str:
    """Fill {field} and {nested.field} from a JSON body. Unknown fields stay as written."""

    def get(path: str) -> Any:
        cur = body
        for part in path.split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                return None
        return cur

    def sub(m: re.Match[str]) -> str:
        v = get(m.group(1))
        if v is None:
            return m.group(0)
        return v if isinstance(v, str) else str(v)

    return FIELD.sub(sub, template)[:MAX_TASK]
