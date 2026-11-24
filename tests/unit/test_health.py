from __future__ import annotations

import asyncio

import httpx
from keel_api.main import create_app

from keel.providers.fake import FakeProvider
from keel.store.memory import MemoryStore
from keel.tools.registry import Registry
from keel.worker.worker import Worker, serve
from tests.helpers import trading_script


def client(app) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://api.test")


async def test_ready_when_the_store_answers():
    async with client(create_app(MemoryStore())) as c:
        r = await c.get("/readyz")
    assert r.status_code == 200 and r.json()["checks"] == {"store": "ok", "accounts": "ok"}


async def test_not_ready_when_the_database_is_down():
    store = MemoryStore()

    async def down() -> None:
        raise ConnectionError("no mongo")

    store.ping = down  # type: ignore[method-assign]
    async with client(create_app(store)) as c:
        r = await c.get("/readyz")
        assert r.status_code == 503 and r.json()["checks"]["store"].startswith("down")
        assert (await c.get("/healthz")).status_code == 200  # alive, just not ready


async def test_workers_check_in_while_serving(tmp_path, monkeypatch):
    beat = tmp_path / "alive"
    monkeypatch.setenv("KEEL_WORKER_HEARTBEAT_FILE", str(beat))
    store = MemoryStore()
    stop = asyncio.Event()
    task = asyncio.create_task(
        serve(store, Worker("w-9", store, FakeProvider(trading_script([])), Registry()), stop, poll_s=0.01)
    )
    await asyncio.sleep(0.05)
    stop.set()
    await task
    assert [w["worker_id"] for w in await store.live_workers()] == ["w-9"]
    assert beat.exists()
