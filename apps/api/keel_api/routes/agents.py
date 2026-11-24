from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from keel.core.agent import AgentConfig, Limits
from keel.core.ids import new_id

from ..deps import Developer, State, Viewer, audit

router = APIRouter(prefix="/v1/agents", tags=["agents"])


class AgentIn(BaseModel):
    id: str | None = None  # set to publish a new version of an existing agent
    name: str
    model: str = "claude-opus-5-5"
    effort: str | None = None
    system_prompt: str = ""
    tools: list[str] = Field(default_factory=list)
    approval_required: list[str] = Field(default_factory=list)
    description: str = ""
    agents: list[str] = Field(default_factory=list)  # agents this one may hand work to
    limits: Limits = Field(default_factory=Limits)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_or_version(body: AgentIn, c: Developer, st: State) -> AgentConfig:
    if not set(body.approval_required) <= set(body.tools):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "approval_required must be a subset of tools"
        )
    for aid in body.agents:
        if aid == body.id or await st.store.get_agent(c.org_id, aid) is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"no agent {aid} to hand off to")
    version = 1
    if body.id:
        prev = await st.store.get_agent(c.org_id, body.id)
        if prev is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "agent not found")
        version = prev.version + 1
    agent = AgentConfig(
        id=body.id or new_id("agt"),
        org_id=c.org_id,
        version=version,
        **body.model_dump(exclude={"id"}),
    )
    await st.store.put_agent(agent)
    await audit(st, c, "agent.created" if version == 1 else "agent.versioned", agent.id, version=version)
    return agent


@router.get("")
async def list_agents(c: Viewer, st: State) -> list[AgentConfig]:
    return await st.store.list_agents(c.org_id)


@router.get("/{agent_id}")
async def get_agent(agent_id: str, c: Viewer, st: State) -> AgentConfig:
    a = await st.store.get_agent(c.org_id, agent_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "agent not found")
    return a
