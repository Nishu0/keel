from __future__ import annotations

import json

import httpx
import pytest
import respx

from keel.core.events import EventType
from keel.providers.base import Completion, ToolCall
from keel.providers.fake import FakeProvider
from keel.store.memory import MemoryStore
from keel.tools.registry import Registry, ToolInputError
from keel.tools.webhook import WebhookTool, sign, verify
from keel.worker.loop import Outcome, ToolError
from keel.worker.worker import Worker, sweep
from tests.helpers import ORG, agent, new_run

URL = "https://desk.example.com/keel/place_order"
RECON = "https://desk.example.com/keel/place_order/status"
SCHEMA = {
    "type": "object",
    "properties": {"market": {"type": "string"}, "size": {"type": "integer", "minimum": 1}},
    "required": ["market", "size"],
    "additionalProperties": False,
}


def hook(**kw) -> WebhookTool:
    return WebhookTool(name="place_order", url=URL, signing_secret="whsec_test", input_schema=SCHEMA, **kw)


def test_signature_roundtrip():
    body = b'{"a":1}'
    sig = sign("s3cret", "1700000000", body)
    assert sig.startswith("v1=")
    assert not verify("s3cret", "1700000000", body, sig)  # too old
    import time

    ts = str(int(time.time()))
    assert verify("s3cret", ts, body, sign("s3cret", ts, body))
    assert not verify("other", ts, body, sign("s3cret", ts, body))


def test_schema_validation():
    t = hook().tool()
    assert t.validate({"market": "FED", "size": 3}) == {"market": "FED", "size": 3}
    with pytest.raises(ToolInputError, match="size"):
        t.validate({"market": "FED", "size": 0})


@respx.mock
async def test_signed_request_with_idempotency_key():
    route = respx.post(URL).mock(return_value=httpx.Response(200, json={"order_id": "o1"}))
    out = await hook().tool()({"market": "FED", "size": 3}, "tc_abc")
    assert out == {"order_id": "o1"}
    req = route.calls.last.request
    assert req.headers["idempotency-key"] == "tc_abc"
    assert verify("whsec_test", req.headers["x-keel-timestamp"], req.content, req.headers["x-keel-signature"])
    assert json.loads(req.content) == {"market": "FED", "size": 3}


@respx.mock
async def test_4xx_is_a_definite_failure_and_5xx_is_not():
    respx.post(URL).mock(return_value=httpx.Response(422, text="bad market"))
    with pytest.raises(ToolError):
        await hook().tool()({"market": "X", "size": 1}, "tc_1")
    respx.post(URL).mock(return_value=httpx.Response(503))
    with pytest.raises(RuntimeError):
        await hook().tool()({"market": "X", "size": 1}, "tc_2")


@respx.mock
async def test_5xx_on_external_call_reconciles_instead_of_resending():
    """The desk processed the order but answered 502. keel asks, finds it, and moves on."""
    placed: dict[str, dict] = {}

    def desk(request: httpx.Request) -> httpx.Response:
        key = request.headers["idempotency-key"]
        placed[key] = {"order_id": "o1"}
        return httpx.Response(502)

    respx.post(URL).mock(side_effect=desk)
    respx.get(RECON).mock(
        side_effect=lambda r: (
            httpx.Response(200, json=placed[k])
            if (k := r.url.params["idempotency_key"]) in placed
            else httpx.Response(404)
        )
    )

    reg = Registry()
    reg.add(hook(reconcile_url=RECON).tool())

    def script(messages):
        if not any(m.role == "tool" for m in messages):
            return Completion(tool_calls=[ToolCall(name="place_order", input={"market": "FED", "size": 3})])
        return Completion(text=messages[-1].content)

    store = MemoryStore()
    await new_run(store, "run_1")
    out = await Worker("w-1", store, FakeProvider(script), reg).process(agent(tools=["place_order"]), "run_1")
    assert out is Outcome.COMPLETED
    assert len(placed) == 1
    log = await store.events(ORG, "run_1")
    done = next(e for e in log if e.type is EventType.TOOL_COMPLETED)
    assert done.payload["reconciled"] is True and done.payload["output"] == {"order_id": "o1"}
    assert await sweep(store) == []
