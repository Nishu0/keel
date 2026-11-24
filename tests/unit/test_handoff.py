from __future__ import annotations

from keel.core.agent import AgentConfig
from keel.core.events import EventType
from keel.core.status import RunStatus
from keel.providers.base import Completion, Message, ToolCall
from keel.providers.fake import FakeProvider
from keel.store.memory import MemoryStore
from keel.tools.registry import Registry
from keel.worker.loop import Outcome
from keel.worker.worker import Worker
from tests.helpers import ORG, new_run


class WorkerKilled(BaseException):
    pass


def lead_script(messages: list[Message]):
    """The lead hands research off, then reports what came back."""
    results = [m for m in messages if m.role == "tool"]
    if not results:
        return Completion(
            tool_calls=[
                ToolCall(name="handoff__researcher", input={"task": "find the 2026 cold start numbers"})
            ]
        )
    return Completion(text=f"Summary: {results[-1].content}")


def child_script(messages: list[Message]):
    return Completion(text="gVisor 180ms, Firecracker 125ms")


class Router:
    """One provider for both agents: picks a script by the first user message."""

    def __init__(self) -> None:
        self.calls = 0

    async def complete(self, messages, tools, model, max_tokens, system="", effort=None):
        self.calls += 1
        if any(t.name.startswith("handoff__") for t in tools):
            return lead_script(messages)
        return child_script(messages)


async def setup(store: MemoryStore) -> tuple[AgentConfig, AgentConfig]:
    child = AgentConfig(
        id="agt_research", org_id=ORG, name="researcher", description="Reads sources and reports numbers."
    )
    lead = AgentConfig(id="agt_lead", org_id=ORG, name="lead", agents=["agt_research"])
    await store.put_agent(child)
    await store.put_agent(lead)
    await new_run(store, "run_lead")
    await store.set_status(ORG, "run_lead", RunStatus.QUEUED)
    return lead, child


async def test_handoff_waits_for_the_child_and_uses_its_answer():
    store = MemoryStore()
    lead, child = await setup(store)
    w = Worker("w-1", store, Router(), Registry())

    assert await w.process(lead, "run_lead") is Outcome.WAITING
    parent = await store.get_run(ORG, "run_lead")
    assert parent.status is RunStatus.WAITING and parent.lease is None  # holds no worker while it waits

    kids = [r for r in await store.list_runs(ORG) if r.parent_run_id == "run_lead"]
    assert len(kids) == 1 and kids[0].agent_id == "agt_research"
    assert await w.process(child, kids[0].id) is Outcome.COMPLETED

    # the finished child put the parent back in the queue
    assert (await store.get_run(ORG, "run_lead")).status is RunStatus.QUEUED
    assert await w.process(lead, "run_lead") is Outcome.COMPLETED
    log = await store.events(ORG, "run_lead")
    assert log[-1].payload["output"] == "Summary: gVisor 180ms, Firecracker 125ms"
    types = [e.type for e in log]
    assert EventType.HANDOFF_STARTED in types and EventType.HANDOFF_COMPLETED in types
    done = next(e for e in log if e.type is EventType.TOOL_COMPLETED)
    assert done.payload["child_run_id"] == kids[0].id


async def test_a_crash_mid_handoff_does_not_start_a_second_child():
    store = MemoryStore()
    lead, _ = await setup(store)
    real_append = store.append
    armed = True

    async def die_after_child_is_created(event, worker_id):
        nonlocal armed
        if armed and event.type is EventType.HANDOFF_STARTED:
            armed = False
            raise WorkerKilled  # the child exists, the parent never recorded handing off
        await real_append(event, worker_id)

    store.append = die_after_child_is_created
    w = Worker("w-1", store, Router(), Registry())
    try:
        await w.process(lead, "run_lead")
    except WorkerKilled:
        store.force_expire("run_lead")
        await store.set_status(ORG, "run_lead", RunStatus.QUEUED)

    assert await Worker("w-2", store, Router(), Registry()).process(lead, "run_lead") is Outcome.WAITING
    kids = [r for r in await store.list_runs(ORG) if r.parent_run_id == "run_lead"]
    assert len(kids) == 1  # same deterministic child id, found again


async def test_a_failed_child_is_reported_to_the_parent():
    store = MemoryStore()
    lead, child = await setup(store)
    child_limited = child.model_copy(update={"limits": child.limits.model_copy(update={"max_steps": 0})})
    w = Worker("w-1", store, Router(), Registry())
    await w.process(lead, "run_lead")
    kid = next(r for r in await store.list_runs(ORG) if r.parent_run_id == "run_lead")
    assert await w.process(child_limited, kid.id) is Outcome.LIMIT_EXCEEDED
    assert await w.process(lead, "run_lead") is Outcome.COMPLETED
    failed = next(e for e in await store.events(ORG, "run_lead") if e.type is EventType.TOOL_FAILED)
    assert "researcher failed" in failed.payload["error"]


async def test_handoffs_only_to_listed_agents():
    store = MemoryStore()
    lead, _ = await setup(store)

    def tries_unlisted(messages):
        if not any(m.role == "tool" for m in messages):
            return Completion(tool_calls=[ToolCall(name="handoff__intruder", input={"task": "x"})])
        return Completion(text=messages[-1].content)

    loner = lead.model_copy(update={"agents": []})
    out = await Worker("w-1", store, FakeProvider(tries_unlisted), Registry()).process(loner, "run_lead")
    assert out is Outcome.COMPLETED
    assert "unknown tool handoff__intruder" in (await store.events(ORG, "run_lead"))[-1].payload["output"]
