"""Starter agents a new org can copy and run."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from keel.automations import quota_problem, start_run
from keel.core.agent import AgentConfig
from keel.core.ids import new_id
from keel.templates import BY_ID, TEMPLATES

from ..deps import Developer, State, Viewer, audit
from .tools import tools_for_org

router = APIRouter(prefix="/v1/templates", tags=["templates"])


async def _available(st: Any, org_id: str) -> set[str]:
    return set((await tools_for_org(st, org_id)).names())


@router.get("")
async def list_templates(c: Viewer, st: State) -> list[dict[str, Any]]:
    have = await _available(st, c.org_id)
    return [
        t.model_dump()
        | {
            "missing": [x for x in t.tools if x not in have],
            "has_suggested": [x for x in t.suggests if x in have],
        }
        for t in TEMPLATES
    ]


class UseIn(BaseModel):
    run_sample: bool = True
    name: str | None = None


@router.post("/{template_id}", status_code=status.HTTP_201_CREATED)
async def use_template(template_id: str, body: UseIn, c: Developer, st: State) -> dict[str, Any]:
    """Create an agent from the template. Tools this org doesn't have are left out and
    reported back; suggested tools are added when the org has them."""
    t = BY_ID.get(template_id)
    if t is None:
        raise HTTPException(404, "no template with that id")
    have = await _available(st, c.org_id)
    tools = [x for x in t.tools if x in have] + [x for x in t.suggests if x in have]
    agent = AgentConfig(
        id=new_id("agt"),
        org_id=c.org_id,
        name=body.name or t.name,
        description=t.description,
        system_prompt=t.system_prompt,
        tools=tools,
        approval_required=[x for x in t.approval_required if x in tools],
        effort=t.effort,
    )
    await st.store.put_agent(agent)
    await audit(st, c, "agent.created", agent.id, version=1, template=t.id)
    out: dict[str, Any] = {
        "agent": agent.model_dump(),
        "missing": [x for x in t.tools if x not in have],
        "run_id": None,
    }
    if body.run_sample and not await quota_problem(st.accounts, st.store, c.org_id):
        out["run_id"] = (await start_run(st.store, c.org_id, agent, t.sample_task, c.actor)).id
    return out
