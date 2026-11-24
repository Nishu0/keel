from __future__ import annotations

from typing import Any

import pytest

from keel.core.events import Event, EventType
from keel.core.ids import call_id
from keel.core.status import RunStatus
from keel.providers.fake import FakeProvider
from keel.store.base import LeaseLost
from keel.store.memory import MemoryStore
from keel.tools.registry import Registry
from keel.worker.loop import Outcome
from keel.worker.worker import Worker, sweep
from tests.helpers import ORG, Desk, agent, make_registry, new_run, trading_script


class WorkerKilled(BaseException):
    """Simulates the process dying. BaseException so nothing in keel catches it."""


async def types(store: MemoryStore, run_id: str) -> list[str]:
    return [e.type.value for e in await store.events(ORG, run_id)]


async def status(store: MemoryStore, run_id: str) -> RunStatus:
    run = await store.get_run(ORG, run_id)
    assert run is not None
    return run.status


async def kill_and_requeue(store: MemoryStore, run_id: str) -> None:
    store.force_expire(run_id)
    assert run_id in await sweep(store)


async def test_happy_path(store: MemoryStore, desk: Desk):
    await new_run(store, "run_1")
    provider = FakeProvider(trading_script(["FED", "CPI"]))
    out = await Worker("w-1", store, provider, make_registry(desk)).process(agent(), "run_1")

    assert out is Outcome.COMPLETED
    assert await status(store, "run_1") is RunStatus.COMPLETED
    assert desk.invocations == 2 and len(desk.orders) == 2
    assert provider.calls == 4
    log = await types(store, "run_1")
    assert log[0] == "run.created" and log[1] == "run.started" and log[-1] == "run.completed"


async def test_crash_after_order_lands_reconciles_instead_of_resending(store: MemoryStore, desk: Desk):
    await new_run(store, "run_1")
    reg = make_registry(desk)
    real = reg.get("place_order").fn
    crashed = False

    async def place_then_die(market: str, size: int, idempotency_key: str) -> Any:
        nonlocal crashed
        out = await real(market=market, size=size, idempotency_key=idempotency_key)
        if not crashed:
            crashed = True
            raise WorkerKilled  # order is placed, tool.completed never written
        return out

    reg.get("place_order").fn = place_then_die
    provider = FakeProvider(trading_script(["FED"]))

    with pytest.raises(WorkerKilled):
        await Worker("w-1", store, provider, reg).process(agent(), "run_1")
    calls_before = provider.calls
    await kill_and_requeue(store, "run_1")

    out = await Worker("w-2", store, provider, reg).process(agent(), "run_1")
    assert out is Outcome.COMPLETED
    assert len(desk.orders) == 1 and desk.invocations == 1  # reconciled, never resent
    assert provider.calls == calls_before + 1  # only the final answer; earlier steps reused

    events = await store.events(ORG, "run_1")
    resumed = next(e for e in events if e.type is EventType.RUN_RESUMED)
    assert resumed.payload["worker"] == "w-2"
    assert resumed.payload["from_worker"] == "w-1" and resumed.payload["reason"] == "lease expired"
    assert resumed.payload["in_doubt"] == [call_id("run_1", 2, 0)]
    assert any(e.type is EventType.TOOL_COMPLETED and e.payload.get("reconciled") for e in events)


async def test_crash_before_order_lands_sends_it_once(store: MemoryStore, desk: Desk):
    await new_run(store, "run_1")
    reg = make_registry(desk)
    real = reg.get("place_order").fn
    crashed = False

    async def die_then_place(market: str, size: int, idempotency_key: str) -> Any:
        nonlocal crashed
        if not crashed:
            crashed = True
            raise WorkerKilled  # died before the request left
        return await real(market=market, size=size, idempotency_key=idempotency_key)

    reg.get("place_order").fn = die_then_place
    provider = FakeProvider(trading_script(["FED"]))
    with pytest.raises(WorkerKilled):
        await Worker("w-1", store, provider, reg).process(agent(), "run_1")
    await kill_and_requeue(store, "run_1")

    assert await Worker("w-2", store, provider, reg).process(agent(), "run_1") is Outcome.COMPLETED
    assert len(desk.orders) == 1 and desk.invocations == 1  # reconcile said "never landed", sent exactly once


async def test_no_reconcile_means_needs_review(store: MemoryStore, desk: Desk):
    await new_run(store, "run_1")
    reg = make_registry(desk, reconcile=False)
    real = reg.get("place_order").fn

    async def place_then_die(**kw: Any) -> Any:
        await real(**kw)
        raise WorkerKilled

    reg.get("place_order").fn = place_then_die
    provider = FakeProvider(trading_script(["FED"]))
    with pytest.raises(WorkerKilled):
        await Worker("w-1", store, provider, reg).process(agent(), "run_1")
    await kill_and_requeue(store, "run_1")

    reg.get("place_order").fn = real
    assert await Worker("w-2", store, provider, reg).process(agent(), "run_1") is Outcome.NEEDS_REVIEW
    assert await status(store, "run_1") is RunStatus.NEEDS_REVIEW
    assert desk.invocations == 1  # did not guess

    # a person checks the desk, sees the order, and records it from the ui
    cid = call_id("run_1", 2, 0)
    log = await store.events(ORG, "run_1")
    await store.append(
        Event(
            org_id=ORG,
            run_id="run_1",
            seq=len(log) + 1,
            type=EventType.TOOL_COMPLETED,
            step=2,
            payload={"call_id": cid, "name": "place_order", "output": desk.orders[cid], "by": "usr_1"},
        ),
        None,
    )
    await store.set_status(ORG, "run_1", RunStatus.QUEUED)
    assert await Worker("w-3", store, provider, reg).process(agent(), "run_1") is Outcome.COMPLETED
    assert desk.invocations == 1


async def test_approval_pauses_then_resumes(store: MemoryStore, desk: Desk):
    await new_run(store, "run_1")
    provider = FakeProvider(trading_script(["FED"]))
    reg = make_registry(desk)
    a = agent(approval_required=["place_order"])

    assert await Worker("w-1", store, provider, reg).process(a, "run_1") is Outcome.WAITING_FOR_APPROVAL
    assert await status(store, "run_1") is RunStatus.WAITING_FOR_APPROVAL
    assert desk.invocations == 0

    log = await store.events(ORG, "run_1")
    await store.append(
        Event(
            org_id=ORG,
            run_id="run_1",
            seq=len(log) + 1,
            type=EventType.APPROVAL_GRANTED,
            step=2,
            payload={"call_id": call_id("run_1", 2, 0), "by": "usr_1"},
        ),
        None,
    )
    await store.set_status(ORG, "run_1", RunStatus.QUEUED)
    assert await Worker("w-2", store, provider, reg).process(a, "run_1") is Outcome.COMPLETED
    assert desk.invocations == 1
    resumed = next(e for e in await store.events(ORG, "run_1") if e.type is EventType.RUN_RESUMED)
    assert resumed.payload["reason"] == "approval"


async def test_denied_call_goes_back_to_the_model(store: MemoryStore, desk: Desk):
    await new_run(store, "run_1")
    provider = FakeProvider(trading_script(["FED"]))
    reg = make_registry(desk)
    a = agent(approval_required=["place_order"])
    await Worker("w-1", store, provider, reg).process(a, "run_1")
    log = await store.events(ORG, "run_1")
    await store.append(
        Event(
            org_id=ORG,
            run_id="run_1",
            seq=len(log) + 1,
            type=EventType.APPROVAL_DENIED,
            step=2,
            payload={"call_id": call_id("run_1", 2, 0), "by": "usr_1"},
        ),
        None,
    )
    await store.set_status(ORG, "run_1", RunStatus.QUEUED)
    assert await Worker("w-2", store, provider, reg).process(a, "run_1") is Outcome.COMPLETED
    assert desk.invocations == 0
    failed = [e for e in await store.events(ORG, "run_1") if e.type is EventType.TOOL_FAILED]
    assert failed[0].payload["error"] == "denied by a person"


async def test_step_limit(store: MemoryStore, desk: Desk):
    await new_run(store, "run_1")
    provider = FakeProvider(trading_script(["A", "B", "C", "D"]))
    out = await Worker("w-1", store, provider, make_registry(desk)).process(
        agent(limits={"max_steps": 2}), "run_1"
    )
    assert out is Outcome.LIMIT_EXCEEDED
    assert (await types(store, "run_1"))[-1] == "limit.exceeded"


async def test_stale_worker_cannot_write(store: MemoryStore):
    await new_run(store, "run_1")
    assert await store.claim(ORG, "run_1", "w-1", 20)
    store.force_expire("run_1")
    assert await store.claim(ORG, "run_1", "w-2", 20)
    with pytest.raises(LeaseLost):
        await store.append(Event(org_id=ORG, run_id="run_1", seq=2, type=EventType.RUN_STARTED), "w-1")


async def test_runs_are_invisible_across_orgs(store: MemoryStore):
    await new_run(store, "run_1")
    assert await store.get_run("org_other", "run_1") is None
    with pytest.raises(KeyError):
        await store.events("org_other", "run_1")


async def test_unknown_tool_is_reported_to_the_model(store: MemoryStore):
    from keel.providers.base import Completion, ToolCall

    def script(messages):
        if not any(m.role == "tool" for m in messages):
            return Completion(tool_calls=[ToolCall(name="rm_rf", input={})])
        return Completion(text=messages[-1].content)

    await new_run(store, "run_1")
    out = await Worker("w-1", store, FakeProvider(script), Registry()).process(agent(tools=[]), "run_1")
    assert out is Outcome.COMPLETED
    run_log = await store.events(ORG, "run_1")
    assert run_log[-1].payload["output"] == '{"error":"unknown tool rm_rf"}'


async def test_serve_drains_the_queue_across_orgs(desk: Desk):
    import asyncio

    from keel.core.agent import AgentConfig
    from keel.store.base import RunDoc
    from keel.worker.worker import serve

    store = MemoryStore()
    for org in ("org_a", "org_b"):
        await store.put_agent(AgentConfig(id="agt", org_id=org, name="t", tools=["read_book", "place_order"]))
        for i in range(3):
            rid = f"{org}_run_{i}"
            await store.create_run(RunDoc(id=rid, org_id=org, agent_id="agt", input={"task": "t"}))
            await store.append(
                Event(
                    org_id=org,
                    run_id=rid,
                    seq=1,
                    type=EventType.RUN_CREATED,
                    payload={"input": {"task": "t"}},
                ),
                None,
            )
    worker = Worker("w-1", store, FakeProvider(trading_script(["FED"])), make_registry(desk))
    stop = asyncio.Event()
    task = asyncio.create_task(serve(store, worker, stop, concurrency=2, poll_s=0.01))
    for _ in range(200):
        done = [
            r for o in ("org_a", "org_b") for r in await store.list_runs(o) if r.status == RunStatus.COMPLETED
        ]
        if len(done) == 6:
            break
        await asyncio.sleep(0.01)
    stop.set()
    await task
    assert len(done) == 6
    assert desk.invocations == 6
