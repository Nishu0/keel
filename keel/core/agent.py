from __future__ import annotations

from pydantic import BaseModel, Field


class Limits(BaseModel):
    max_steps: int = 60
    max_tokens: int = 400_000
    timeout_s: int = 3600


class AgentConfig(BaseModel):
    """A versioned agent definition: prompt, model, allowed tools, limits."""

    id: str
    org_id: str
    name: str
    description: str = ""
    version: int = 1
    model: str = "claude-opus-5-5"
    effort: str | None = None  # low | medium | high | xhigh | max; provider default when unset
    system_prompt: str = ""
    tools: list[str] = Field(default_factory=list)
    approval_required: list[str] = Field(default_factory=list)
    # other agents (by id) this one may hand work to; each shows up as a handoff__<name> tool
    agents: list[str] = Field(default_factory=list)
    limits: Limits = Field(default_factory=Limits)
    max_output_tokens: int = 16000
