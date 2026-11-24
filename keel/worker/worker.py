"""Workers claim runs, hold a lease with a heartbeat, and drive the loop."""

from __future__ import annotations

import asyncio
import contextlib
import logging

from keel.core.agent import AgentConfig
from keel.core.status import RunStatus
from keel.providers.base import Provider
from keel.queue.scheduler import FairScheduler
from keel.security.redact import Redactor
from keel.store.base import LeaseLost, SeqConflict, Store
from keel.tools.registry import Registry
from keel.worker.loop import Outcome, RunDriver

log = logging.getLogger("keel.worker")

LEASE_TTL_S = 20.0
HEARTBEAT_S = 5.0


class Worker:
    def __init__(
        self,
        worker_id: str,
        store: Store,
        provider: Provider,
        registry: Registry,
        *,
        lease_ttl_s: float = LEASE_TTL_S,
        heartbeat_s: float = HEARTBEAT_S,
        redactor: Redactor | None = None,
    ) -> None:
        self.redactor = redactor
        self.id = worker_id
        self.store = store
        self.provider = provider
        self.registry = registry
        self.lease_ttl_s = lease_ttl_s
        self.heartbeat_s = heartbeat_s

    async def process(self, agent: AgentConfig, run_id: str) -> Outcome | None:
        """Run until the run stops or this worker loses it. ``None`` means we
        didn't get it or lost the lease, and someone else will carry on."""
        org = agent.org_id
        if not await self.store.claim(org, run_id, self.id, self.lease_ttl_s):
            return None

        driver = RunDriver(
            store=self.store,
            provider=self.provider,
            registry=self.registry,
            agent=agent,
            org_id=org,
            run_id=run_id,
            worker_id=self.id,
            redactor=self.redactor,
        )
        task = asyncio.create_task(driver.drive())
        beat = asyncio.create_task(self._heartbeat(org, run_id, task))
        try:
            return await task
        except (LeaseLost, SeqConflict, asyncio.CancelledError):
            # another worker owns this run now. drop it without writing anything.
            return None
        finally:
            beat.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await beat

    async def _heartbeat(self, org: str, run_id: str, task: asyncio.Task[Outcome]) -> None:
        while not task.done():
            await asyncio.sleep(self.heartbeat_s)
            if not await self.store.heartbeat(org, run_id, self.id, self.lease_ttl_s):
                task.cancel()
                return


async def sweep(store: Store) -> list[str]:
    """Re-queue runs whose worker stopped heartbeating. Runs every 10s in prod."""
    requeued = []
    for run in await store.expired():
        await store.set_status(run.org_id, run.id, RunStatus.QUEUED)
        requeued.append(run.id)
    return requeued


async def serve(
    store: Store,
    worker: Worker,
    stop: asyncio.Event,
    concurrency: int = 4,
    poll_s: float = 0.5,
    scheduler: FairScheduler | None = None,
) -> None:
    """Pick up queued runs fairly across orgs and sweep expired leases until ``stop`` is set."""
    sched = scheduler or FairScheduler()
    active: set[asyncio.Task] = set()
    log.info("%s serving, concurrency %d", worker.id, concurrency)
    while not stop.is_set():
        for rid in await sweep(store):
            log.info("requeued %s (lease expired)", rid)
        if len(active) < concurrency:
            # look past the head of the queue so one busy org can't fill every slot
            for run in sched.pick(await store.queued(200), concurrency - len(active)):
                agent = await store.get_agent(run.org_id, run.agent_id)
                if agent is None:
                    log.warning("run %s references missing agent %s", run.id, run.agent_id)
                    sched.done(run.org_id)
                    continue
                t = asyncio.create_task(worker.process(agent, run.id))
                active.add(t)
                t.add_done_callback(active.discard)
                t.add_done_callback(lambda _, org=run.org_id: sched.done(org))
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(stop.wait(), timeout=poll_s)
    log.info("%s stopping, waiting on %d runs", worker.id, len(active))
    await asyncio.gather(*active, return_exceptions=True)
