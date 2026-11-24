"""Runs the same guarantees against a real MongoDB.

docker run -d -p 27017:27017 mongo:8
KEEL_MONGO_URL=mongodb://localhost:27017 uv run pytest tests/integration
"""

from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from keel.core.events import Event, EventType
from keel.core.status import RunStatus
from keel.store.base import LeaseLost, RunDoc, SeqConflict, ToolCallDoc

URL = os.environ.get("KEEL_MONGO_URL")
pytestmark = pytest.mark.skipif(not URL, reason="set KEEL_MONGO_URL to run mongo tests")

ORG = "org_it"


@pytest.fixture
async def store():
    from keel.store.mongo import MongoStore

    s = MongoStore(URL, db=f"keel_test_{uuid.uuid4().hex[:8]}")
    await s.ensure_indexes()
    yield s
    await s.client.drop_database(s.db.name)
    await s.client.close()


async def _run(store, rid="run_1"):
    await store.create_run(RunDoc(id=rid, org_id=ORG, agent_id="agt", input={"task": "t"}))
    await store.append(Event(org_id=ORG, run_id=rid, seq=1, type=EventType.RUN_CREATED), None)


async def test_unique_seq(store):
    await _run(store)
    with pytest.raises(SeqConflict):
        await store.append(Event(org_id=ORG, run_id="run_1", seq=1, type=EventType.RUN_STARTED), None)
    assert [e.seq for e in await store.events(ORG, "run_1")] == [1]


async def test_lease_lifecycle(store):
    await _run(store)
    assert await store.claim(ORG, "run_1", "w-1", 20)
    assert not await store.claim(ORG, "run_1", "w-2", 20)
    await store.append(Event(org_id=ORG, run_id="run_1", seq=2, type=EventType.RUN_STARTED), "w-1")

    # expire w-1's lease by hand, then w-2 takes over and w-1 is locked out
    await store.runs.update_one(
        {"_id": "run_1"}, {"$set": {"lease.expires_at": datetime.now(UTC) - timedelta(seconds=1)}}
    )
    assert [r.id for r in await store.expired()] == ["run_1"]
    assert await store.claim(ORG, "run_1", "w-2", 20)
    with pytest.raises(LeaseLost):
        await store.append(Event(org_id=ORG, run_id="run_1", seq=3, type=EventType.RUN_RESUMED), "w-1")
    assert not await store.heartbeat(ORG, "run_1", "w-1", 20)
    assert await store.heartbeat(ORG, "run_1", "w-2", 20)

    await store.set_status(ORG, "run_1", RunStatus.COMPLETED, "w-2")
    run = await store.get_run(ORG, "run_1")
    assert run.status is RunStatus.COMPLETED and run.lease is None


async def test_tool_call_upsert(store):
    await _run(store)
    doc = ToolCallDoc(id="tc_1", org_id=ORG, run_id="run_1", tool="place_order", input={"x": 1})
    first = await store.start_call(doc)
    assert first.status == "started" and first.attempts == 1
    again = await store.start_call(doc)
    assert again.attempts == 2
    await store.complete_call(ORG, "tc_1", {"order_id": "o1"})
    done = await store.start_call(doc)
    assert done.status == "completed" and done.output == {"order_id": "o1"}


async def test_org_isolation(store):
    await _run(store)
    assert await store.get_run("org_other", "run_1") is None
    assert await store.list_runs("org_other") == []
    with pytest.raises(KeyError):
        await store.events("org_other", "run_1")
