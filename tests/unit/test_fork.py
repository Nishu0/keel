from __future__ import annotations

import pytest

from keel.core.events import EventType
from keel.core.fold import fold
from keel.core.fork import ForkError, fork_events
from keel.core.ids import call_id
from keel.providers.fake import FakeProvider
from keel.store.base import RunDoc
from keel.store.memory import MemoryStore
from keel.worker.loop import Outcome
from keel.worker.worker import Worker
from tests.helpers import ORG, Desk, agent, make_registry, new_run, trading_script


async def finished_run(store: MemoryStore, desk: Desk, markets=("FED", "CPI")) -> FakeProvider:
    await new_run(store, "run_src")
    provider = FakeProvider(trading_script(list(markets)))
    assert (
        await Worker("w-1", store, provider, make_registry(desk)).process(agent(), "run_src")
        is Outcome.COMPLETED
    )
    return provider


async def test_fork_reuses_everything_before_the_step(store: MemoryStore, desk: Desk):
    await finished_run(store, desk)  # step 1 read, step 2 FED order, step 3 CPI order, step 4 answer
    src = await store.events(ORG, "run_src")
    forked = fork_events(src, "run_fork", from_step=3)

    s = fold(forked)
    assert s.step == 2 and s.pending is None and not s.in_doubt
    assert forked[0].payload["forked_from"] == {"run_id": "run_src", "step": 3}
    assert all(e.run_id == "run_fork" for e in forked)
    assert {e.payload["call_id"] for e in forked if e.type is EventType.TOOL_COMPLETED} == {
        call_id("run_fork", 1, 0),
        call_id("run_fork", 2, 0),
    }

    # run the fork: it continues from step 3 without redoing steps 1 and 2
    await store.create_run(RunDoc(id="run_fork", org_id=ORG, agent_id="agt_t", input={"task": "trade"}))
    for e in forked:
        await store.append(e, None)
    provider = FakeProvider(trading_script(["FED", "CPI"]))
    out = await Worker("w-2", store, provider, make_registry(desk)).process(agent(), "run_fork")
    assert out is Outcome.COMPLETED
    assert provider.calls == 2  # step 3 and the final answer only
    assert desk.invocations == 3  # FED once in the source, CPI once in each run


async def test_swapping_a_tool_result(store: MemoryStore, desk: Desk):
    await finished_run(store, desk)
    src = await store.events(ORG, "run_src")
    read = call_id("run_src", 1, 0)
    forked = fork_events(
        src, "run_fork", from_step=2, tool_outputs={read: {"market": "FED", "bid": 0.9, "ask": 0.91}}
    )
    swapped = next(e for e in forked if e.type is EventType.TOOL_COMPLETED)
    assert swapped.payload["output"]["bid"] == 0.9 and swapped.payload["swapped"] is True
    assert fold(forked).messages[-1].content.startswith('{"market":"FED","bid":0.9')


async def test_fork_rejects_bad_requests(store: MemoryStore, desk: Desk):
    await finished_run(store, desk)
    src = await store.events(ORG, "run_src")
    with pytest.raises(ForkError):
        fork_events(src, "x", from_step=0)
    with pytest.raises(ForkError):
        fork_events(src, "x", from_step=99)
    with pytest.raises(ForkError, match="no tool call"):
        fork_events(src, "x", from_step=2, tool_outputs={call_id("run_src", 3, 0): {}})


async def test_an_unfinished_call_before_the_fork_runs_again(store: MemoryStore):
    from keel.core.events import Event

    await new_run(store, "run_src")
    cid = call_id("run_src", 1, 0)
    evs = [
        Event(org_id=ORG, run_id="run_src", seq=2, type=EventType.MODEL_REQUESTED, step=1),
        Event(
            org_id=ORG,
            run_id="run_src",
            seq=3,
            type=EventType.MODEL_COMPLETED,
            step=1,
            payload={"text": "", "tool_calls": [{"name": "read_book", "input": {"market": "X"}}]},
        ),
        Event(
            org_id=ORG, run_id="run_src", seq=4, type=EventType.TOOL_STARTED, step=1, payload={"call_id": cid}
        ),
    ]
    for e in evs:
        await store.append(e, None)
    forked = fork_events(await store.events(ORG, "run_src"), "run_fork", from_step=2)
    assert not fold(forked).in_doubt  # the dangling start is dropped; the call will simply run
