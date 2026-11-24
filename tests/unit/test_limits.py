from __future__ import annotations

from typing import Any

import pytest

from keel.core.events import EventType
from keel.core.fold import fold
from keel.core.limits import HARD_EVENT_BYTES, MAX_VALUE_BYTES, EventTooLarge, bound_payload, cap, size
from keel.providers.base import Completion, Message, ToolCall, Usage
from keel.providers.fake import FakeProvider
from keel.store.memory import MemoryStore
from keel.tools.registry import Registry
from keel.worker.loop import Outcome
from keel.worker.worker import Worker
from tests.helpers import ORG, agent, new_run


def test_small_values_pass_through_untouched():
    v = {"rows": [1, 2, 3]}
    assert cap(v) is v


def test_big_values_become_a_readable_marker():
    out = cap("x" * (MAX_VALUE_BYTES * 3))
    assert out["truncated"] is True and out["original_bytes"] > MAX_VALUE_BYTES
    assert len(out["preview"]) == 16_000
    assert size(out) < MAX_VALUE_BYTES


def test_model_events_are_never_trimmed_only_hard_stopped():
    raw = {"raw": "y" * (MAX_VALUE_BYTES * 2)}
    assert bound_payload(raw, trimmable=False) == raw  # signed blocks stay byte for byte
    with pytest.raises(EventTooLarge):
        bound_payload({"raw": "z" * (HARD_EVENT_BYTES + 1)}, trimmable=False)


async def test_a_huge_tool_output_is_capped_once_and_the_model_sees_the_same_thing():
    reg = Registry()

    @reg.tool(effect="pure")
    async def dump() -> str:
        """Return a lot."""
        return "row\n" * 500_000  # about 2 MB

    seen: list[str] = []

    def script(messages: list[Message]) -> Completion:
        results = [m for m in messages if m.role == "tool"]
        if not results:
            return Completion(
                text="dumping", tool_calls=[ToolCall(name="dump", input={})], usage=Usage(input=1, output=1)
            )
        seen.append(results[-1].content)
        return Completion(text="done", usage=Usage(input=1, output=1))

    store = MemoryStore()
    await new_run(store, "run_big")
    w = Worker("w-1", store, FakeProvider(script), reg)
    assert await w.process(agent(tools=["dump"]), "run_big") is Outcome.COMPLETED

    events = await store.events(ORG, "run_big")
    done = next(e for e in events if e.type == EventType.TOOL_COMPLETED)
    assert done.payload["output"]["truncated"] is True
    assert max(size(e.payload) for e in events) < MAX_VALUE_BYTES  # nothing near mongo's limit
    # what a resumed run would rebuild is what the live model was shown
    rebuilt: Any = [m.content for m in fold(events).messages if m.role == "tool"][-1]
    assert rebuilt == seen[-1] and "truncated" in seen[-1]
