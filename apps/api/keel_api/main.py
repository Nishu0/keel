"""keel api. Auth, rbac, tenancy, validation and streaming. No agent logic here."""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from keel import __version__
from keel.store.base import Store
from keel.store.memory import MemoryStore

from .deps import AppState
from .rbac import Role
from .routes import agents, audit, runs, usage


def _default_store() -> Store:
    if url := os.environ.get("KEEL_MONGO_URL"):
        from keel.store.mongo import MongoStore

        return MongoStore(url)
    return MemoryStore()


def create_app(store: Store | None = None) -> FastAPI:
    store = store or _default_store()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if ensure := getattr(store, "ensure_indexes", None):
            await ensure()
        if os.environ.get("KEEL_EMBEDDED_WORKER") != "1":
            yield
            return
        # dev only: drive runs inside the api process so the in memory store just works
        from keel.tools.builtin import registry
        from keel.worker.__main__ import _provider
        from keel.worker.worker import Worker, serve

        stop = asyncio.Event()
        task = asyncio.create_task(serve(store, Worker("w-embedded", store, _provider(), registry), stop))
        yield
        stop.set()
        await task

    app = FastAPI(title="keel", version=__version__, lifespan=lifespan)
    app.state.keel = AppState(store=store)

    # single org dev mode: a key from the environment, never a hardcoded one
    if dev_key := os.environ.get("KEEL_DEV_API_KEY"):
        app.state.keel.add_key(dev_key, os.environ.get("KEEL_DEV_ORG", "org_local"), Role.OWNER)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.environ.get("KEEL_WEB_ORIGIN", "http://localhost:3000").split(","),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(agents.router)
    app.include_router(runs.router)
    app.include_router(audit.router)
    app.include_router(usage.router)

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    return app


app = create_app()
