from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from keel.core.events import Event, EventType
from keel.core.fold import fold
from keel.core.ids import call_id
from keel.providers.anthropic import AnthropicProvider, cost, to_api_messages
from keel.providers.base import ToolSpec, Usage


class Block(SimpleNamespace):
    def model_dump(self, **_: Any) -> dict[str, Any]:
        return dict(self.__dict__)


class StubMessages:
    def __init__(self, resp: Any) -> None:
        self.resp, self.kwargs = resp, None

    async def create(self, **kwargs: Any) -> Any:
        self.kwargs = kwargs
        return self.resp


def stub_client(resp: Any) -> Any:
    msgs = StubMessages(resp)
    return SimpleNamespace(beta=SimpleNamespace(messages=msgs)), msgs


async def test_complete_normalises_and_keeps_raw_blocks():
    resp = SimpleNamespace(
        content=[
            Block(type="thinking", thinking="", signature="sig"),
            Block(type="text", text="Reading the book."),
            Block(type="tool_use", id="toolu_1", name="read_book", input={"market": "FED"}),
        ],
        usage=SimpleNamespace(input_tokens=1000, output_tokens=200),
        model="claude-opus-5-5",
        stop_reason="tool_use",
    )
    client, msgs = stub_client(resp)
    p = AnthropicProvider(client)
    spec = ToolSpec(name="read_book", description="d", input_schema={"type": "object", "properties": {}})
    comp = await p.complete([], [spec], "claude-opus-5-5", 16000, system="be careful", effort="high")

    assert comp.text == "Reading the book."
    assert comp.tool_calls[0].provider_id == "toolu_1" and comp.tool_calls[0].id is None
    assert comp.raw[0]["type"] == "thinking"  # replayed unchanged next turn
    assert comp.cost_usd == cost("claude-opus-5-5", Usage(input=1000, output=200))
    assert msgs.kwargs["fallbacks"] == "default"
    assert msgs.kwargs["output_config"] == {"effort": "high"}
    assert msgs.kwargs["system"] == "be careful"


def test_replay_maps_ids_and_groups_results():
    raw = [
        {"type": "thinking", "thinking": "", "signature": "sig"},
        {"type": "tool_use", "id": "toolu_a", "name": "read_book", "input": {}},
        {"type": "tool_use", "id": "toolu_b", "name": "read_book", "input": {}},
    ]
    c0, c1 = call_id("r", 1, 0), call_id("r", 1, 1)
    events = [
        Event(org_id="o", run_id="r", seq=1, type=EventType.RUN_CREATED, payload={"input": {"task": "go"}}),
        Event(
            org_id="o",
            run_id="r",
            seq=2,
            type=EventType.MODEL_COMPLETED,
            step=1,
            payload={
                "text": "",
                "raw": raw,
                "tool_calls": [
                    {"name": "read_book", "input": {}, "provider_id": "toolu_a"},
                    {"name": "read_book", "input": {}, "provider_id": "toolu_b"},
                ],
            },
        ),
        Event(
            org_id="o",
            run_id="r",
            seq=3,
            type=EventType.TOOL_COMPLETED,
            step=1,
            payload={"call_id": c0, "name": "read_book", "output": {"bid": 1}},
        ),
        Event(
            org_id="o",
            run_id="r",
            seq=4,
            type=EventType.TOOL_FAILED,
            step=1,
            payload={"call_id": c1, "name": "read_book", "error": "timeout"},
        ),
    ]
    api = to_api_messages(fold(events).messages)
    assert [m["role"] for m in api] == ["user", "assistant", "user"]
    assert api[1]["content"] == raw
    results = api[2]["content"]
    assert [r["tool_use_id"] for r in results] == ["toolu_a", "toolu_b"]
    assert results[1]["is_error"] is True


async def test_without_fallbacks_uses_plain_messages_and_prefix():
    resp = SimpleNamespace(
        content=[Block(type="text", text="hi")],
        usage=SimpleNamespace(input_tokens=10, output_tokens=2),
        model="anthropic.claude-opus-5-5",
        stop_reason="end_turn",
    )
    msgs = StubMessages(resp)
    client = SimpleNamespace(messages=msgs)  # no .beta, like the bedrock client
    p = AnthropicProvider(client, fallbacks=False, model_prefix="anthropic.")
    comp = await p.complete([], [], "claude-opus-5-5", 16000)
    assert msgs.kwargs["model"] == "anthropic.claude-opus-5-5"
    assert "fallbacks" not in msgs.kwargs
    assert comp.text == "hi" and comp.cost_usd > 0
