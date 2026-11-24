from __future__ import annotations

from keel.core.events import EventType
from keel.providers.base import Completion, ToolCall
from keel.providers.fake import FakeProvider
from keel.security.redact import MASK, Redactor
from keel.store.memory import MemoryStore
from keel.tools.registry import Registry
from keel.worker.worker import Worker
from tests.helpers import ORG, agent, new_run


def test_masks_known_values_and_patterns():
    r = Redactor(secrets=["hunter2-desk-token"])
    out = r(
        {
            "text": "token is hunter2-desk-token and key sk-ant-api03-abcdefghijklmnopqrstuvwxyz",
            "nested": [{"note": "ghp_abcdefghijklmnopqrstuvwxyz0123456789"}],
            "headers": {"Authorization": "Bearer abc", "accept": "json"},
            "size": 10,
        }
    )
    assert "hunter2" not in str(out) and "sk-ant" not in str(out) and "ghp_" not in str(out)
    assert out["headers"] == {"Authorization": MASK, "accept": "json"}
    assert out["size"] == 10


def test_signed_thinking_blocks_are_left_alone():
    block = {"type": "thinking", "thinking": "", "signature": "sk-proj-" + "A" * 40}
    assert Redactor()({"raw": [block]})["raw"][0] == block


def test_short_strings_are_not_treated_as_secrets():
    assert Redactor(secrets=["abc"]).text("abcdef") == "abcdef"


async def test_secrets_never_reach_the_log():
    store = MemoryStore()
    await new_run(store, "run_1")
    reg = Registry()
    secret = "desk-secret-9f8e7d6c5b"

    @reg.tool
    async def leaky() -> str:
        """Echoes a secret back, as badly behaved tools do."""
        return f"connected with {secret}"

    def script(messages):
        if not any(m.role == "tool" for m in messages):
            return Completion(tool_calls=[ToolCall(name="leaky", input={})])
        return Completion(text=messages[-1].content)

    w = Worker("w-1", store, FakeProvider(script), reg, redactor=Redactor([secret]))
    await w.process(agent(tools=["leaky"]), "run_1")
    log = await store.events(ORG, "run_1")
    assert secret not in str([e.payload for e in log])
    assert any(e.type is EventType.TOOL_COMPLETED and MASK in str(e.payload) for e in log)
