from __future__ import annotations

from collections import defaultdict
from typing import Annotated, Any

from fastapi import APIRouter, Query

from keel.core.events import EventType

from ..deps import State, Viewer

router = APIRouter(prefix="/v1/usage", tags=["usage"])


@router.get("")
async def usage(c: Viewer, st: State, limit: Annotated[int, Query(ge=1, le=1000)] = 500) -> dict[str, Any]:
    """Tokens, cost and runs per day and agent, from model calls in the event log.

    Computed on read for now. The hosted version aggregates usage events hourly
    and reports them to billing.
    """
    days: dict[str, dict[str, dict[str, float]]] = defaultdict(
        lambda: defaultdict(lambda: {"input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "runs": 0})
    )
    totals = {"input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "runs": 0}
    for run in await st.store.list_runs(c.org_id, limit=limit):
        counted = False
        for e in await st.store.events(c.org_id, run.id):
            day = e.ts.date().isoformat()
            bucket = days[day][run.agent_id]
            if e.type is EventType.RUN_CREATED and not counted:
                bucket["runs"] += 1
                totals["runs"] += 1
                counted = True
            elif e.type is EventType.MODEL_COMPLETED:
                u = e.payload.get("usage") or {}
                cost = float(e.payload.get("cost_usd") or 0)
                for k, v in (("input_tokens", u.get("input", 0)), ("output_tokens", u.get("output", 0))):
                    bucket[k] += v
                    totals[k] += v
                bucket["cost_usd"] += cost
                totals["cost_usd"] += cost
    return {
        "totals": {**totals, "cost_usd": round(totals["cost_usd"], 6)},
        "days": [
            {"date": d, "agents": {a: {**v, "cost_usd": round(v["cost_usd"], 6)} for a, v in agents.items()}}
            for d, agents in sorted(days.items())
        ],
    }
