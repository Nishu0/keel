"""Run a worker process: ``python -m keel.worker``.

Picks queued runs, drives them, and sweeps expired leases. Stateless, so run
as many as you like.
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal
import socket

from keel.providers.fake import FakeProvider
from keel.store.base import Store
from keel.tools.builtin import registry
from keel.worker.worker import Worker, serve

log = logging.getLogger("keel.worker")


def _store() -> Store:
    if url := os.environ.get("KEEL_MONGO_URL"):
        from keel.store.mongo import MongoStore

        return MongoStore(url)
    from keel.store.memory import MemoryStore

    log.warning("KEEL_MONGO_URL not set, using an in memory store (nothing is shared or durable)")
    return MemoryStore()


def _accounts():
    if url := os.environ.get("KEEL_MONGO_URL"):
        from keel.accounts.mongo import MongoAccounts

        return MongoAccounts(url)
    from keel.accounts.store import MemoryAccounts

    return MemoryAccounts()


def _provider():
    kind = os.environ.get("KEEL_PROVIDER", "anthropic")
    if kind == "demo":
        from keel.providers.fake import DemoProvider

        log.warning("KEEL_PROVIDER=demo, runs use a scripted provider instead of a model")
        return DemoProvider()
    if kind == "fake":
        from keel.providers.base import Completion

        log.warning("KEEL_PROVIDER=fake, runs get an echo instead of a model")
        return FakeProvider(lambda msgs: Completion(text=f"echo: {msgs[0].content}"))
    from keel.providers.anthropic import AnthropicProvider

    if kind == "bedrock":
        return AnthropicProvider.bedrock(os.environ.get("AWS_REGION"))
    return AnthropicProvider()


async def main() -> None:
    from keel.config import load_env

    load_env()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    store = _store()
    if hasattr(store, "ensure_indexes"):
        await store.ensure_indexes()
    worker_id = os.environ.get("KEEL_WORKER_ID", f"w-{socket.gethostname()}-{os.getpid()}")
    if os.environ.get("KEEL_SANDBOX") == "docker":
        from keel.sandbox.tools import register

        register(registry)  # run_python, run_shell
    accounts = _accounts()
    try:
        from keel.security.crypto import Sealer

        sealer = Sealer.from_env()
    except Exception:
        sealer = None  # org webhook tools need their signing secret, so they're skipped without it

    from keel.tools.org import registry_for

    async def tools_for(org_id: str):
        return await registry_for(org_id, registry, accounts, sealer)

    from keel.accounts.email import mailer_from_env
    from keel.accounts.enforce import concurrency_for, quota_check
    from keel.accounts.notify import notifier

    public_url = os.environ.get("KEEL_PUBLIC_URL", "http://localhost:3000")
    worker = Worker(
        worker_id,
        store,
        _provider(),
        registry,
        tools_for=tools_for,
        quota=quota_check(accounts, store),
        notify=notifier(accounts, mailer_from_env(), sealer, public_url),
    )
    concurrency = int(os.environ.get("KEEL_WORKER_CONCURRENCY", "4"))
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    await serve(store, worker, stop, concurrency, concurrency_for=concurrency_for(accounts))


if __name__ == "__main__":
    asyncio.run(main())
