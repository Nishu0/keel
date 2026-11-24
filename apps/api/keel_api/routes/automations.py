"""Schedules (cron) and triggers (inbound webhooks) that start runs."""

from __future__ import annotations

import json
import secrets
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from keel.accounts.models import Schedule, Trigger
from keel.accounts.store import token_hash
from keel.automations import AutomationError, fill, next_fire, quota_problem, start_run
from keel.core.events import utcnow
from keel.core.ids import new_id

from ..deps import Developer, State, Viewer, audit

router = APIRouter(prefix="/v1", tags=["automations"])
MAX_BODY = 64 * 1024


# ---------- schedules ----------


class ScheduleIn(BaseModel):
    agent_id: str
    name: str = Field(min_length=1, max_length=80)
    cron: str
    task: str = Field(min_length=1, max_length=8_000)


@router.get("/schedules")
async def list_schedules(c: Viewer, st: State) -> list[dict[str, Any]]:
    return [s.model_dump(exclude={"org_id"}) for s in await st.accounts.list_schedules(c.org_id)]


@router.post("/schedules", status_code=201)
async def add_schedule(body: ScheduleIn, c: Developer, st: State) -> dict[str, Any]:
    if await st.store.get_agent(c.org_id, body.agent_id) is None:
        raise HTTPException(404, "agent not found")
    try:
        nxt = next_fire(body.cron, utcnow())
    except AutomationError as e:
        raise HTTPException(422, str(e)) from e
    s = await st.accounts.put_schedule(
        Schedule(
            id=new_id("sch"),
            org_id=c.org_id,
            agent_id=body.agent_id,
            name=body.name,
            cron=body.cron,
            task=body.task,
            next_run_at=nxt,
            created_by=c.actor,
        )
    )
    await audit(st, c, "schedule.created", s.id, cron=s.cron)
    return s.model_dump(exclude={"org_id"})


class ToggleIn(BaseModel):
    enabled: bool


@router.patch("/schedules/{schedule_id}")
async def toggle_schedule(schedule_id: str, body: ToggleIn, c: Developer, st: State) -> dict[str, Any]:
    s = next((x for x in await st.accounts.list_schedules(c.org_id) if x.id == schedule_id), None)
    if s is None:
        raise HTTPException(404, "no schedule with that id")
    # re-enabling picks up from now, not from every slot missed while paused
    update: dict[str, Any] = {"enabled": body.enabled}
    if body.enabled and not s.enabled:
        update["next_run_at"] = next_fire(s.cron, utcnow())
    s = await st.accounts.put_schedule(s.model_copy(update=update))
    await audit(st, c, "schedule.toggled", s.id, enabled=body.enabled)
    return s.model_dump(exclude={"org_id"})


@router.delete("/schedules/{schedule_id}", status_code=204)
async def delete_schedule(schedule_id: str, c: Developer, st: State) -> None:
    if not await st.accounts.delete_schedule(c.org_id, schedule_id):
        raise HTTPException(404, "no schedule with that id")
    await audit(st, c, "schedule.deleted", schedule_id)


# ---------- triggers ----------


class TriggerIn(BaseModel):
    agent_id: str
    name: str = Field(min_length=1, max_length=80)
    task_template: str = Field(min_length=1, max_length=8_000)


def _trigger_out(t: Trigger) -> dict[str, Any]:
    return t.model_dump(exclude={"org_id", "id"}) | {"id": t.id[:12]}


@router.get("/triggers")
async def list_triggers(c: Viewer, st: State) -> list[dict[str, Any]]:
    return [_trigger_out(t) for t in await st.accounts.list_triggers(c.org_id)]


@router.post("/triggers", status_code=201)
async def add_trigger(body: TriggerIn, c: Developer, st: State) -> dict[str, Any]:
    """The url contains the secret and is shown once. Anyone holding it can start runs."""
    if await st.store.get_agent(c.org_id, body.agent_id) is None:
        raise HTTPException(404, "agent not found")
    token = "trg_" + secrets.token_urlsafe(24)
    t = await st.accounts.put_trigger(
        Trigger(
            id=token_hash(token),
            org_id=c.org_id,
            agent_id=body.agent_id,
            name=body.name,
            task_template=body.task_template,
            created_by=c.actor,
        )
    )
    await audit(st, c, "trigger.created", t.id[:12], name=t.name)
    return _trigger_out(t) | {"url": f"{st.public_url.rstrip('/')}/api/keel/v1/hooks/{token}"}


@router.delete("/triggers/{short_id}", status_code=204)
async def delete_trigger(short_id: str, c: Developer, st: State) -> None:
    t = next((x for x in await st.accounts.list_triggers(c.org_id) if x.id.startswith(short_id)), None)
    if t is None or not await st.accounts.delete_trigger(c.org_id, t.id):
        raise HTTPException(404, "no trigger with that id")
    await audit(st, c, "trigger.deleted", short_id)


@router.post("/hooks/{token}", status_code=status.HTTP_202_ACCEPTED)
async def fire_trigger(token: str, request: Request, st: State) -> dict[str, str]:
    """Public: the token in the url is the credential."""
    t = await st.accounts.get_trigger(token_hash(token))
    if t is None:
        raise HTTPException(404, "unknown trigger")
    raw = await request.body()
    if len(raw) > MAX_BODY:
        raise HTTPException(413, "payload too large")
    try:
        body = json.loads(raw) if raw else {}
    except ValueError:
        body = {"text": raw.decode(errors="replace")}
    agent = await st.store.get_agent(t.org_id, t.agent_id)
    if agent is None:
        raise HTTPException(410, "the agent behind this trigger was removed")
    if problem := await quota_problem(st.accounts, st.store, t.org_id):
        raise HTTPException(402, problem)
    run = await start_run(st.store, t.org_id, agent, fill(t.task_template, body), f"trigger:{t.id[:12]}")
    await st.accounts.touch_trigger(t.id)
    return {"run_id": run.id}
