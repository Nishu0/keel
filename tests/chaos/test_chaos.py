"""Chaos test: kill workers at random points and prove nothing fires twice.

Pass criteria from the spec:
- every run reaches a terminal state
- the desk sees exactly one real order per logical call (zero duplicates)
- event logs have no gaps in seq
"""

from __future__ import annotations

import os
import random
from typing import Any

import pytest

from keel.core.events import Event
from keel.core.fold import fold
from keel.core.status import RunStatus
from keel.providers.fake import FakeProvider
from keel.store.memory import MemoryStore
from keel.worker.loop import Outcome
from keel.worker.worker import Worker, sweep
from tests.helpers import ORG, Desk, agent, make_registry, new_run, trading_script

RUNS = int(os.environ.get("KEEL_CHAOS_RUNS", "300"))
MARKETS = ["FED", "CPI", "GDP"]


class WorkerKilled(BaseException):
    pass


class ChaosStore(MemoryStore):
    """Dies before some writes, the way a real process dies between two lines."""

    def __init__(self, rng: random.Random, p: float) -> None:
        super().__init__()
        self.rng, self.p, self.armed = rng, p, False

    async def append(self, event: Event, worker_id: str | None) -> None:
        if self.armed and worker_id is not None and self.rng.random() < self.p:
            raise WorkerKilled
        await super().append(event, worker_id)


@pytest.mark.parametrize("seed", [1, 2, 3])
async def test_no_duplicates_under_random_kills(seed: int):
    rng = random.Random(seed)
    store = ChaosStore(rng, p=0.08)
    desk = Desk()
    reg = make_registry(desk)
    real = reg.get("place_order").fn

    async def flaky_place(market: str, size: int, idempotency_key: str) -> Any:
        if rng.random() < 0.1:
            raise WorkerKilled  # died before the request left
        out = await real(market=market, size=size, idempotency_key=idempotency_key)
        if rng.random() < 0.1:
            raise WorkerKilled  # died after it landed, before it was recorded
        return out

    reg.get("place_order").fn = flaky_place
    provider = FakeProvider(trading_script(MARKETS))
    a = agent()

    ids = [f"run_{seed}_{i}" for i in range(RUNS)]
    for rid in ids:
        await new_run(store, rid)
    store.armed = True

    kills = 0
    outcomes: dict[str, Outcome] = {}
    for _round in range(200):
        await sweep(store)
        pending = [rid for rid in ids if rid not in outcomes]
        if not pending:
            break
        for rid in pending:
            run = await store.get_run(ORG, rid)
            if run.status != RunStatus.QUEUED:
                continue
            w = Worker(f"w-{rng.randint(1, 8)}", store, provider, reg)
            try:
                out = await w.process(a, rid)
            except WorkerKilled:
                kills += 1
                store.force_expire(rid)  # its lease runs out; the sweeper will requeue
                continue
            if out is not None:
                outcomes[rid] = out

    print(f"\nseed={seed} runs={RUNS} kills={kills} orders={len(desk.orders)} sends={desk.invocations}")
    assert kills > RUNS // 4, "chaos didn't actually kill much"
    assert len(outcomes) == RUNS, f"{RUNS - len(outcomes)} runs never finished"
    assert set(outcomes.values()) == {Outcome.COMPLETED}

    logical_calls = RUNS * len(MARKETS)
    assert len(desk.orders) == logical_calls
    assert desk.invocations == logical_calls, f"{desk.invocations - logical_calls} duplicate sends"

    for rid in ids:
        events = await store.events(ORG, rid)
        assert [e.seq for e in events] == list(range(1, len(events) + 1))
        assert fold(events).done
