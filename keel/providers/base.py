"""Provider interface. Every adapter normalises to text plus a list of tool calls."""

from __future__ import annotations

from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field


class ToolCall(BaseModel):
    name: str
    input: dict[str, Any] = Field(default_factory=dict)
    id: str | None = None  # keel's call_id, filled in when folded
    provider_id: str | None = None  # the id the model gave this call (e.g. toolu_...)


class Message(BaseModel):
    role: Literal["user", "assistant", "tool"]
    content: str = ""
    tool_calls: list[ToolCall] = Field(default_factory=list)
    tool_call_id: str | None = None
    name: str | None = None
    is_error: bool = False
    # provider native content blocks (thinking included), replayed unchanged next turn
    raw: list[dict[str, Any]] | None = None


class Usage(BaseModel):
    input: int = 0
    output: int = 0


class Completion(BaseModel):
    text: str = ""
    tool_calls: list[ToolCall] = Field(default_factory=list)
    usage: Usage = Field(default_factory=Usage)
    cost_usd: float = 0.0
    model: str | None = None  # the model that actually answered (fallbacks can change it)
    stop_reason: str | None = None
    raw: list[dict[str, Any]] | None = None


class ToolSpec(BaseModel):
    name: str
    description: str
    input_schema: dict[str, Any]


class Provider(Protocol):
    async def complete(
        self,
        messages: list[Message],
        tools: list[ToolSpec],
        model: str,
        max_tokens: int,
        system: str = "",
        effort: str | None = None,
    ) -> Completion: ...
