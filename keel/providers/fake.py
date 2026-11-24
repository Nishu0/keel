"""A provider that replays scripted responses. Used by tests and the chaos harness."""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from keel.providers.base import Completion, Message, ToolCall, ToolSpec, Usage

Script = Callable[[list[Message]], Completion]


class FakeProvider:
    """Decides its response from the conversation so far, so replays are deterministic.

    ``script`` receives the messages and returns the next completion. ``calls``
    counts real invocations, which lets tests prove a resumed run didn't pay
    for a model call twice.
    """

    def __init__(self, script: Script) -> None:
        self.script = script
        self.calls = 0

    async def complete(
        self,
        messages: list[Message],
        tools: list[ToolSpec],
        model: str,
        max_tokens: int,
        system: str = "",
        effort: str | None = None,
    ) -> Completion:
        self.calls += 1
        return self.script(messages)


class DemoProvider:
    """No model needed: calls the agent's first tool once, then reports what came back.

    Handy for trying approvals and the run page locally (``KEEL_PROVIDER=demo``).
    """

    async def complete(
        self,
        messages: list[Message],
        tools: list[ToolSpec],
        model: str,
        max_tokens: int,
        system: str = "",
        effort: str | None = None,
    ) -> Completion:
        from keel.providers.anthropic import cost

        results = [m for m in messages if m.role == "tool"]
        usage = Usage(input=sum(len(m.content) for m in messages) // 4 + 200, output=40)
        price = cost(model, usage)  # priced as if the agent's model had answered
        if tools and not results:
            t = tools[0]
            return Completion(
                text=f"Calling {t.name} before I answer.",
                # a handoff needs a task; pass the run's own task along
                tool_calls=[
                    ToolCall(
                        name=t.name,
                        input=_demo_input(t, messages[0].content),
                    )
                ],
                usage=usage,
            )
        if results:
            return Completion(
                text=f"{results[-1].name} returned {results[-1].content}", usage=usage, cost_usd=price
            )
        return Completion(text=f"echo: {messages[0].content}", usage=usage, cost_usd=price)


def _demo_input(t: ToolSpec, task: str) -> dict[str, Any]:
    """Plausible arguments for the demo model: fill each required field from the task."""
    props = t.input_schema.get("properties", {})
    out: dict[str, Any] = {}
    for name in t.input_schema.get("required", []):
        kind = props.get(name, {}).get("type", "string")
        if kind in ("integer", "number"):
            out[name] = 1
        elif kind == "boolean":
            out[name] = False
        elif kind == "string" and "url" in name:
            m = re.search(r"https?://\S+|\b[\w-]+\.(?:org|com|dev|io|net)\b", task)
            url = m.group(0).rstrip(".,)") if m else "https://example.com"
            out[name] = url if url.startswith("http") else f"https://{url}"
        elif kind == "string":
            out[name] = task
    return out
