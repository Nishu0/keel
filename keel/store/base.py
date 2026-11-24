"""Store interface. Mongo in production, memory in tests and the chaos harness."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal, Protocol

from keel.core.agent import AgentConfig
from keel.core.events import Event
from keel.core.status import RunStatus


class LeaseLost(Exception):
    """This worker no longer holds the run. Stop immediately, write nothing."""


class SeqConflict(Exception):
    """Another writer already appended this seq. The unique (run_id, seq) guard."""


@dataclass
class Lease:
    worker_id: str
    expires_at: datetime


@dataclass
class RunDoc:
    id: str
    org_id: str
    agent_id: str
    status: RunStatus = RunStatus.QUEUED
    input: dict[str, Any] = field(default_factory=dict)
    lease: Lease | None = None
    last_seq: int = 0
    parent_run_id: str | None = None


CallStatus = Literal["started", "completed"]


@dataclass
class ToolCallDoc:
    id: str  # call_id
    org_id: str
    run_id: str
    tool: str
    input: dict[str, Any]
    status: CallStatus = "started"
    output: Any = None
    attempts: int = 1


@dataclass
class AuditEntry:
    org_id: str
    actor: str  # "key:<id>" or "usr:<id>"
    action: str  # e.g. "run.created", "approval.granted", "agent.versioned"
    target: str
    ip: str | None = None
    ts: datetime | None = None
    detail: dict[str, Any] = field(default_factory=dict)


class Store(Protocol):
    async def create_run(self, run: RunDoc) -> None: ...
    async def get_run(self, org_id: str, run_id: str) -> RunDoc | None: ...
    async def list_runs(
        self, org_id: str, *, status: RunStatus | None = None, agent_id: str | None = None, limit: int = 50
    ) -> list[RunDoc]: ...
    async def set_status(
        self, org_id: str, run_id: str, status: RunStatus, worker_id: str | None = None
    ) -> None: ...

    async def append(self, event: Event, worker_id: str | None) -> None:
        """Append one event. Raises LeaseLost if ``worker_id`` doesn't hold the
        lease, SeqConflict if the seq is taken."""
        ...

    async def events(self, org_id: str, run_id: str, after_seq: int = 0) -> list[Event]: ...

    async def claim(self, org_id: str, run_id: str, worker_id: str, ttl_s: float) -> bool:
        """Take the lease if the run is queued or its lease has expired."""
        ...

    async def heartbeat(self, org_id: str, run_id: str, worker_id: str, ttl_s: float) -> bool: ...
    async def release(self, org_id: str, run_id: str, worker_id: str) -> None: ...
    async def expired(self) -> list[RunDoc]: ...
    async def queued(self, limit: int = 20) -> list[RunDoc]:
        """Oldest queued runs across orgs. Stand in until the per org queues land."""
        ...

    async def start_call(self, call: ToolCallDoc) -> ToolCallDoc:
        """Upsert by call id. Returns the stored doc, which may already be completed."""
        ...

    async def complete_call(self, org_id: str, call_id: str, output: Any) -> None: ...

    async def put_agent(self, agent: AgentConfig) -> None:
        """Store a version. Old versions are kept so runs can show what they ran with."""
        ...

    async def get_agent(
        self, org_id: str, agent_id: str, version: int | None = None
    ) -> AgentConfig | None: ...
    async def list_agents(self, org_id: str) -> list[AgentConfig]: ...

    async def audit(self, entry: AuditEntry) -> None:
        """Append only. Never updated or deleted by keel."""
        ...

    async def audit_log(self, org_id: str, limit: int = 100) -> list[AuditEntry]: ...
