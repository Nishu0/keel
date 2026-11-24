"""In memory store with the same guarantees as the mongo one.

Used by unit tests and the chaos harness. Time comes from an injectable clock
so tests can expire leases without sleeping.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from copy import deepcopy
from datetime import datetime, timedelta
from typing import Any

from keel.core.agent import AgentConfig
from keel.core.events import Event, utcnow
from keel.core.status import RELEASES_LEASE, RunStatus
from keel.store.base import AuditEntry, Lease, LeaseLost, RunDoc, SeqConflict, ToolCallDoc


class MemoryStore:
    def __init__(self, clock: Callable[[], datetime] = utcnow) -> None:
        self.clock = clock
        self._runs: dict[str, RunDoc] = {}
        self._events: dict[str, list[Event]] = {}
        self._calls: dict[str, ToolCallDoc] = {}
        self._audit: list[AuditEntry] = []
        self._agents: dict[tuple[str, str, int], AgentConfig] = {}  # (org, id, version)
        self._lock = asyncio.Lock()

    def _run(self, org_id: str, run_id: str) -> RunDoc:
        r = self._runs.get(run_id)
        # tenant isolation: a run in another org simply doesn't exist
        if r is None or r.org_id != org_id:
            raise KeyError(run_id)
        return r

    async def create_run(self, run: RunDoc) -> None:
        async with self._lock:
            if run.id in self._runs:
                raise ValueError(f"run {run.id} exists")
            self._runs[run.id] = deepcopy(run)
            self._events[run.id] = []

    async def get_run(self, org_id: str, run_id: str) -> RunDoc | None:
        try:
            return deepcopy(self._run(org_id, run_id))
        except KeyError:
            return None

    async def list_runs(
        self, org_id: str, *, status: RunStatus | None = None, agent_id: str | None = None, limit: int = 50
    ) -> list[RunDoc]:
        out = [
            deepcopy(r)
            for r in reversed(self._runs.values())  # newest first
            if r.org_id == org_id
            and (status is None or r.status == status)
            and (agent_id is None or r.agent_id == agent_id)
        ]
        return out[:limit]

    async def set_status(
        self, org_id: str, run_id: str, status: RunStatus, worker_id: str | None = None
    ) -> None:
        async with self._lock:
            r = self._run(org_id, run_id)
            if worker_id is not None:
                self._check_lease(r, worker_id)
            r.status = status
            if status in RELEASES_LEASE:
                r.lease = None

    def _check_lease(self, r: RunDoc, worker_id: str) -> None:
        if r.lease is None or r.lease.worker_id != worker_id or r.lease.expires_at <= self.clock():
            raise LeaseLost(f"{worker_id} does not hold {r.id}")

    async def append(self, event: Event, worker_id: str | None) -> None:
        async with self._lock:
            r = self._run(event.org_id, event.run_id)
            if worker_id is not None:
                self._check_lease(r, worker_id)
            log = self._events[event.run_id]
            if any(e.seq == event.seq for e in log):
                raise SeqConflict(f"{event.run_id} seq {event.seq}")
            if event.seq != r.last_seq + 1:
                raise SeqConflict(f"{event.run_id} expected seq {r.last_seq + 1}, got {event.seq}")
            log.append(event)
            r.last_seq = event.seq

    async def events(self, org_id: str, run_id: str, after_seq: int = 0) -> list[Event]:
        self._run(org_id, run_id)
        return [e for e in self._events[run_id] if e.seq > after_seq]

    async def claim(self, org_id: str, run_id: str, worker_id: str, ttl_s: float) -> bool:
        async with self._lock:
            r = self._run(org_id, run_id)
            now = self.clock()
            expired = r.status == RunStatus.RUNNING and (r.lease is None or r.lease.expires_at <= now)
            if r.status != RunStatus.QUEUED and not expired:
                return False
            r.status = RunStatus.RUNNING
            r.lease = Lease(worker_id, now + timedelta(seconds=ttl_s))
            return True

    async def heartbeat(self, org_id: str, run_id: str, worker_id: str, ttl_s: float) -> bool:
        async with self._lock:
            r = self._run(org_id, run_id)
            try:
                self._check_lease(r, worker_id)
            except LeaseLost:
                return False
            r.lease = Lease(worker_id, self.clock() + timedelta(seconds=ttl_s))
            return True

    async def release(self, org_id: str, run_id: str, worker_id: str) -> None:
        async with self._lock:
            r = self._run(org_id, run_id)
            if r.lease and r.lease.worker_id == worker_id:
                r.lease = None

    async def expired(self) -> list[RunDoc]:
        now = self.clock()
        return [
            deepcopy(r)
            for r in self._runs.values()
            if r.status == RunStatus.RUNNING and (r.lease is None or r.lease.expires_at <= now)
        ]

    async def queued(self, limit: int = 20) -> list[RunDoc]:
        return [deepcopy(r) for r in self._runs.values() if r.status == RunStatus.QUEUED][:limit]

    async def start_call(self, call: ToolCallDoc) -> ToolCallDoc:
        async with self._lock:
            existing = self._calls.get(call.id)
            if existing:
                if existing.status == "started":
                    existing.attempts += 1
                return deepcopy(existing)
            self._calls[call.id] = deepcopy(call)
            return deepcopy(call)

    async def complete_call(self, org_id: str, call_id: str, output: Any) -> None:
        async with self._lock:
            c = self._calls[call_id]
            if c.org_id != org_id:
                raise KeyError(call_id)
            c.status, c.output = "completed", output

    async def put_agent(self, agent: AgentConfig) -> None:
        self._agents[(agent.org_id, agent.id, agent.version)] = agent.model_copy(deep=True)

    async def get_agent(self, org_id: str, agent_id: str, version: int | None = None) -> AgentConfig | None:
        versions = [a for (o, i, _), a in self._agents.items() if o == org_id and i == agent_id]
        if version is not None:
            versions = [a for a in versions if a.version == version]
        return max(versions, key=lambda a: a.version).model_copy(deep=True) if versions else None

    async def list_agents(self, org_id: str) -> list[AgentConfig]:
        latest: dict[str, AgentConfig] = {}
        for a in self._agents.values():
            if a.org_id == org_id and (a.id not in latest or a.version > latest[a.id].version):
                latest[a.id] = a
        return [a.model_copy(deep=True) for a in latest.values()]

    async def audit(self, entry: AuditEntry) -> None:
        self._audit.append(
            deepcopy(entry if entry.ts else AuditEntry(**{**entry.__dict__, "ts": self.clock()}))
        )

    async def audit_log(self, org_id: str, limit: int = 100) -> list[AuditEntry]:
        return [deepcopy(e) for e in reversed(self._audit) if e.org_id == org_id][:limit]

    # test helpers
    def force_expire(self, run_id: str) -> None:
        r = self._runs[run_id]
        if r.lease:
            r.lease.expires_at = self.clock() - timedelta(seconds=1)
