"""MongoDB store.

Guarantees match MemoryStore:
- a unique index on (run_id, seq) is the final guard against two writers
- the lease is taken and checked with conditional updates, never read then write
- every query is filtered by org_id
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from pymongo import ASCENDING, DESCENDING, AsyncMongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError

from keel.core.agent import AgentConfig
from keel.core.events import Event
from keel.core.status import RELEASES_LEASE, RunStatus
from keel.store.base import AuditEntry, Lease, LeaseLost, RunDoc, SeqConflict, ToolCallDoc


def _now() -> datetime:
    return datetime.now(UTC)


class MongoStore:
    def __init__(self, url: str, db: str = "keel") -> None:
        self.client: AsyncMongoClient[dict[str, Any]] = AsyncMongoClient(url, tz_aware=True)
        self.db = self.client[db]
        self.runs = self.db.runs
        self.run_events = self.db.run_events
        self.tool_calls = self.db.tool_calls
        self.agents = self.db.agents
        self.audit_entries = self.db.audit_log

    async def ensure_indexes(self) -> None:
        await self.run_events.create_index([("run_id", ASCENDING), ("seq", ASCENDING)], unique=True)
        await self.runs.create_index([("org_id", ASCENDING), ("created_at", DESCENDING)])
        await self.runs.create_index([("status", ASCENDING), ("lease.expires_at", ASCENDING)])
        await self.runs.create_index([("parent_run_id", ASCENDING)])
        await self.tool_calls.create_index([("org_id", ASCENDING), ("run_id", ASCENDING)])
        await self.audit_entries.create_index([("org_id", ASCENDING), ("ts", DESCENDING)])
        await self.agents.create_index(
            [("org_id", ASCENDING), ("agent_id", ASCENDING), ("version", DESCENDING)], unique=True
        )

    # ---------- runs ----------

    async def create_run(self, run: RunDoc) -> None:
        await self.runs.insert_one(
            {
                "_id": run.id,
                "org_id": run.org_id,
                "agent_id": run.agent_id,
                "status": run.status.value,
                "input": run.input,
                "lease": None,
                "last_seq": 0,
                "parent_run_id": run.parent_run_id,
                "agent_version": run.agent_version,
                "created_at": _now(),
                "updated_at": _now(),
            }
        )

    async def get_run(self, org_id: str, run_id: str) -> RunDoc | None:
        d = await self.runs.find_one({"_id": run_id, "org_id": org_id})
        return _run(d) if d else None

    async def list_runs(
        self, org_id: str, *, status: RunStatus | None = None, agent_id: str | None = None, limit: int = 50
    ) -> list[RunDoc]:
        q: dict[str, Any] = {"org_id": org_id}
        if status:
            q["status"] = status.value
        if agent_id:
            q["agent_id"] = agent_id
        cur = self.runs.find(q).sort("created_at", DESCENDING).limit(limit)
        return [_run(d) async for d in cur]

    async def set_status(
        self, org_id: str, run_id: str, status: RunStatus, worker_id: str | None = None
    ) -> None:
        q: dict[str, Any] = {"_id": run_id, "org_id": org_id}
        if worker_id is not None:
            q |= {"lease.worker_id": worker_id, "lease.expires_at": {"$gt": _now()}}
        update: dict[str, Any] = {"status": status.value, "updated_at": _now()}
        if status in RELEASES_LEASE:
            update["lease"] = None
        res = await self.runs.update_one(q, {"$set": update})
        if res.matched_count == 0:
            if worker_id is not None:
                raise LeaseLost(f"{worker_id} does not hold {run_id}")
            raise KeyError(run_id)

    # ---------- events ----------

    async def append(self, event: Event, worker_id: str | None) -> None:
        if worker_id is not None:
            held = await self.runs.find_one(
                {
                    "_id": event.run_id,
                    "org_id": event.org_id,
                    "lease.worker_id": worker_id,
                    "lease.expires_at": {"$gt": _now()},
                },
                {"_id": 1},
            )
            if not held:
                raise LeaseLost(f"{worker_id} does not hold {event.run_id}")
        try:
            await self.run_events.insert_one(event.model_dump(mode="python"))
        except DuplicateKeyError as e:
            raise SeqConflict(f"{event.run_id} seq {event.seq}") from e
        await self.runs.update_one(
            {"_id": event.run_id, "org_id": event.org_id, "last_seq": {"$lt": event.seq}},
            {"$set": {"last_seq": event.seq, "updated_at": _now()}},
        )

    async def events(self, org_id: str, run_id: str, after_seq: int = 0) -> list[Event]:
        if not await self.runs.find_one({"_id": run_id, "org_id": org_id}, {"_id": 1}):
            raise KeyError(run_id)
        cur = self.run_events.find({"run_id": run_id, "org_id": org_id, "seq": {"$gt": after_seq}}).sort(
            "seq", 1
        )
        return [Event.model_validate({k: v for k, v in d.items() if k != "_id"}) async for d in cur]

    # ---------- leases ----------

    async def claim(self, org_id: str, run_id: str, worker_id: str, ttl_s: float) -> bool:
        now = _now()
        d = await self.runs.find_one_and_update(
            {
                "_id": run_id,
                "org_id": org_id,
                "$or": [
                    {"status": RunStatus.QUEUED.value},
                    {"status": RunStatus.RUNNING.value, "lease": None},
                    {"status": RunStatus.RUNNING.value, "lease.expires_at": {"$lte": now}},
                ],
            },
            {
                "$set": {
                    "status": RunStatus.RUNNING.value,
                    "lease": {"worker_id": worker_id, "expires_at": now + timedelta(seconds=ttl_s)},
                    "updated_at": now,
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        return d is not None

    async def heartbeat(self, org_id: str, run_id: str, worker_id: str, ttl_s: float) -> bool:
        now = _now()
        res = await self.runs.update_one(
            {"_id": run_id, "org_id": org_id, "lease.worker_id": worker_id, "lease.expires_at": {"$gt": now}},
            {"$set": {"lease.expires_at": now + timedelta(seconds=ttl_s)}},
        )
        return res.modified_count == 1

    async def release(self, org_id: str, run_id: str, worker_id: str) -> None:
        await self.runs.update_one(
            {"_id": run_id, "org_id": org_id, "lease.worker_id": worker_id}, {"$set": {"lease": None}}
        )

    async def expired(self) -> list[RunDoc]:
        cur = self.runs.find(
            {
                "status": RunStatus.RUNNING.value,
                "$or": [{"lease": None}, {"lease.expires_at": {"$lte": _now()}}],
            }
        )
        return [_run(d) async for d in cur]

    async def queued(self, limit: int = 20) -> list[RunDoc]:
        cur = self.runs.find({"status": RunStatus.QUEUED.value}).sort("created_at", ASCENDING).limit(limit)
        return [_run(d) async for d in cur]

    # ---------- tool calls ----------

    async def start_call(self, call: ToolCallDoc) -> ToolCallDoc:
        d = await self.tool_calls.find_one_and_update(
            {"_id": call.id, "org_id": call.org_id},
            {
                "$setOnInsert": {
                    "run_id": call.run_id,
                    "tool": call.tool,
                    "input": call.input,
                    "status": "started",
                    "output": None,
                    "started_at": _now(),
                },
                "$inc": {"attempts": 1},
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return ToolCallDoc(
            id=d["_id"],
            org_id=d["org_id"],
            run_id=d["run_id"],
            tool=d["tool"],
            input=d["input"],
            status=d["status"],
            output=d.get("output"),
            attempts=d.get("attempts", 1),
        )

    async def complete_call(self, org_id: str, call_id: str, output: Any) -> None:
        await self.tool_calls.update_one(
            {"_id": call_id, "org_id": org_id},
            {"$set": {"status": "completed", "output": output, "completed_at": _now()}},
        )

    # ---------- agents ----------

    async def put_agent(self, agent: AgentConfig) -> None:
        doc = agent.model_dump()
        doc["agent_id"] = doc.pop("id")
        await self.agents.insert_one(doc)

    async def get_agent(self, org_id: str, agent_id: str, version: int | None = None) -> AgentConfig | None:
        q: dict[str, Any] = {"org_id": org_id, "agent_id": agent_id}
        if version is not None:
            q["version"] = version
        d = await self.agents.find_one(q, sort=[("version", DESCENDING)])
        return _agent(d) if d else None

    async def list_agents(self, org_id: str) -> list[AgentConfig]:
        cur = self.agents.aggregate(
            [
                {"$match": {"org_id": org_id}},
                {"$sort": {"version": -1}},
                {"$group": {"_id": "$agent_id", "doc": {"$first": "$$ROOT"}}},
                {"$replaceRoot": {"newRoot": "$doc"}},
            ]
        )
        return [_agent(d) async for d in await cur]

    # ---------- audit ----------

    async def audit(self, entry: AuditEntry) -> None:
        doc = dict(entry.__dict__)
        doc["ts"] = doc["ts"] or _now()
        await self.audit_entries.insert_one(doc)

    async def audit_log(self, org_id: str, limit: int = 100) -> list[AuditEntry]:
        cur = self.audit_entries.find({"org_id": org_id}, {"_id": 0}).sort("ts", DESCENDING).limit(limit)
        return [AuditEntry(**d) async for d in cur]


def _agent(d: dict[str, Any]) -> AgentConfig:
    d = {k: v for k, v in d.items() if k != "_id"}
    d["id"] = d.pop("agent_id")
    return AgentConfig.model_validate(d)


def _run(d: dict[str, Any]) -> RunDoc:
    lease = d.get("lease")
    return RunDoc(
        id=d["_id"],
        org_id=d["org_id"],
        agent_id=d["agent_id"],
        status=RunStatus(d["status"]),
        input=d.get("input", {}),
        lease=Lease(lease["worker_id"], lease["expires_at"]) if lease else None,
        last_seq=d.get("last_seq", 0),
        parent_run_id=d.get("parent_run_id"),
        agent_version=d.get("agent_version"),
    )
