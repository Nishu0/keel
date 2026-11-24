"""Mongo implementation of the account store. Same contract as MemoryAccounts."""

from __future__ import annotations

from typing import Any

from pymongo import ASCENDING, AsyncMongoClient, ReturnDocument

from keel.accounts.models import (
    ApiKey,
    Identity,
    Invite,
    MagicLink,
    Membership,
    Org,
    Schedule,
    Secret,
    Session,
    ToolDef,
    Trigger,
    User,
)
from keel.core.events import utcnow


def _doc(m: Any) -> dict[str, Any]:
    d = m.model_dump()
    d["_id"] = d.pop("id")
    return d


def _model(cls: Any, d: dict[str, Any] | None) -> Any:
    if d is None:
        return None
    d = dict(d)
    if "_id" in d:
        d["id"] = d.pop("_id")
    return cls.model_validate(d)


class MongoAccounts:
    def __init__(self, url: str, db: str = "keel") -> None:
        self.client: AsyncMongoClient[dict[str, Any]] = AsyncMongoClient(url, tz_aware=True)
        d = self.db = self.client[db]
        self.users, self.orgs, self.members = d.users, d.orgs, d.memberships
        self.sessions, self.keys, self.invites = d.sessions, d.api_keys, d.invites
        self.links, self.secrets, self.tools = d.magic_links, d.secrets, d.tools
        self.schedules, self.triggers = d.schedules, d.triggers

    async def ensure_indexes(self) -> None:
        await self.users.create_index([("email_lower", ASCENDING)], unique=True)
        await self.users.create_index([("identities.provider", ASCENDING), ("identities.subject", ASCENDING)])
        await self.members.create_index([("org_id", ASCENDING), ("user_id", ASCENDING)], unique=True)
        await self.members.create_index([("user_id", ASCENDING)])
        await self.sessions.create_index("expires_at", expireAfterSeconds=0)
        await self.keys.create_index([("prefix", ASCENDING)], unique=True)
        await self.invites.create_index("expires_at", expireAfterSeconds=7 * 86400)
        await self.links.create_index("expires_at", expireAfterSeconds=86400)
        await self.secrets.create_index([("org_id", ASCENDING), ("name", ASCENDING)], unique=True)
        await self.orgs.create_index([("stripe_customer_id", ASCENDING)], sparse=True)
        await self.tools.create_index([("org_id", ASCENDING), ("name", ASCENDING)], unique=True)
        await self.schedules.create_index([("enabled", ASCENDING), ("next_run_at", ASCENDING)])

    # users
    async def create_user(self, user: User) -> User:
        await self.users.insert_one({**_doc(user), "email_lower": user.email.lower()})
        return user

    async def get_user(self, user_id: str) -> User | None:
        return _model(User, await self.users.find_one({"_id": user_id}, {"email_lower": 0}))

    async def user_by_email(self, email: str) -> User | None:
        return _model(User, await self.users.find_one({"email_lower": email.lower()}, {"email_lower": 0}))

    async def user_by_identity(self, provider: str, subject: str) -> User | None:
        q = {"identities": {"$elemMatch": {"provider": provider, "subject": subject}}}
        return _model(User, await self.users.find_one(q, {"email_lower": 0}))

    async def add_identity(self, user_id: str, identity: Identity) -> None:
        await self.users.update_one({"_id": user_id}, {"$addToSet": {"identities": identity.model_dump()}})

    # orgs and members
    async def create_org(self, org: Org) -> Org:
        await self.orgs.insert_one(_doc(org))
        return org

    async def get_org(self, org_id: str) -> Org | None:
        return _model(Org, await self.orgs.find_one({"_id": org_id}))

    async def update_org(self, org_id: str, **fields: Any) -> None:
        await self.orgs.update_one(
            {"_id": org_id}, {"$set": {k: (v.value if hasattr(v, "value") else v) for k, v in fields.items()}}
        )

    async def org_by_stripe_customer(self, customer_id: str) -> Org | None:
        return _model(Org, await self.orgs.find_one({"stripe_customer_id": customer_id}))

    async def set_member(self, m: Membership) -> None:
        await self.members.update_one(
            {"org_id": m.org_id, "user_id": m.user_id}, {"$set": m.model_dump(mode="json")}, upsert=True
        )

    async def get_member(self, org_id: str, user_id: str) -> Membership | None:
        return _model(
            Membership, await self.members.find_one({"org_id": org_id, "user_id": user_id}, {"_id": 0})
        )

    async def list_members(self, org_id: str) -> list[Membership]:
        return [_model(Membership, d) async for d in self.members.find({"org_id": org_id}, {"_id": 0})]

    async def remove_member(self, org_id: str, user_id: str) -> None:
        await self.members.delete_one({"org_id": org_id, "user_id": user_id})

    async def orgs_for_user(self, user_id: str) -> list[Membership]:
        return [_model(Membership, d) async for d in self.members.find({"user_id": user_id}, {"_id": 0})]

    # sessions
    async def create_session(self, s: Session) -> None:
        await self.sessions.insert_one(_doc(s))

    async def get_session(self, session_id: str) -> Session | None:
        return _model(
            Session, await self.sessions.find_one({"_id": session_id, "expires_at": {"$gt": utcnow()}})
        )

    async def set_session_org(self, session_id: str, org_id: str) -> None:
        await self.sessions.update_one({"_id": session_id}, {"$set": {"org_id": org_id}})

    async def delete_session(self, session_id: str) -> None:
        await self.sessions.delete_one({"_id": session_id})

    # api keys
    async def create_key(self, key: ApiKey) -> None:
        await self.keys.insert_one(_doc(key))

    async def key_by_prefix(self, prefix: str) -> ApiKey | None:
        return _model(ApiKey, await self.keys.find_one({"prefix": prefix}))

    async def list_keys(self, org_id: str) -> list[ApiKey]:
        return [_model(ApiKey, d) async for d in self.keys.find({"org_id": org_id}).sort("created_at", -1)]

    async def revoke_key(self, org_id: str, key_id: str) -> bool:
        res = await self.keys.update_one(
            {"_id": key_id, "org_id": org_id, "revoked_at": None}, {"$set": {"revoked_at": utcnow()}}
        )
        return res.modified_count == 1

    async def touch_key(self, key_id: str) -> None:
        await self.keys.update_one({"_id": key_id}, {"$set": {"last_used_at": utcnow()}})

    # invites and magic links
    async def create_invite(self, inv: Invite) -> None:
        await self.invites.insert_one(_doc(inv))

    async def get_invite(self, invite_id: str) -> Invite | None:
        return _model(Invite, await self.invites.find_one({"_id": invite_id}))

    async def list_invites(self, org_id: str) -> list[Invite]:
        return [_model(Invite, d) async for d in self.invites.find({"org_id": org_id, "accepted_at": None})]

    async def accept_invite(self, invite_id: str) -> None:
        await self.invites.update_one({"_id": invite_id}, {"$set": {"accepted_at": utcnow()}})

    async def create_magic_link(self, link: MagicLink) -> None:
        await self.links.insert_one(_doc(link))

    async def use_magic_link(self, link_id: str) -> MagicLink | None:
        d = await self.links.find_one_and_update(
            {"_id": link_id, "used_at": None, "expires_at": {"$gt": utcnow()}},
            {"$set": {"used_at": utcnow()}},
            return_document=ReturnDocument.AFTER,
        )
        return _model(MagicLink, d)

    # secrets
    async def put_secret(self, s: Secret) -> Secret:
        d = _doc(s)
        _id = d.pop("_id")
        res = await self.secrets.find_one_and_update(
            {"org_id": s.org_id, "name": s.name},
            {"$set": d, "$setOnInsert": {"_id": _id}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return _model(Secret, res)

    async def list_secrets(self, org_id: str) -> list[Secret]:
        return [_model(Secret, d) async for d in self.secrets.find({"org_id": org_id}).sort("name", 1)]

    async def get_secret(self, org_id: str, name: str) -> Secret | None:
        return _model(Secret, await self.secrets.find_one({"org_id": org_id, "name": name}))

    async def delete_secret(self, org_id: str, secret_id: str) -> bool:
        res = await self.secrets.delete_one({"_id": secret_id, "org_id": org_id})
        return res.deleted_count == 1

    # org tools
    async def put_tool(self, t: ToolDef) -> ToolDef:
        d = _doc(t)
        _id = d.pop("_id")
        res = await self.tools.find_one_and_update(
            {"org_id": t.org_id, "name": t.name},
            {"$set": d, "$setOnInsert": {"_id": _id}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return _model(ToolDef, res)

    async def list_tools(self, org_id: str) -> list[ToolDef]:
        return [_model(ToolDef, d) async for d in self.tools.find({"org_id": org_id}).sort("name", 1)]

    async def delete_tools(
        self, org_id: str, *, tool_id: str | None = None, server: str | None = None
    ) -> int:
        q: dict[str, Any] = {"org_id": org_id}
        if tool_id:
            q["_id"] = tool_id
        elif server:
            q["server"] = server
        else:
            return 0
        return (await self.tools.delete_many(q)).deleted_count

    # schedules and triggers
    async def put_schedule(self, s: Schedule) -> Schedule:
        await self.schedules.replace_one({"_id": s.id}, _doc(s), upsert=True)
        return s

    async def list_schedules(self, org_id: str) -> list[Schedule]:
        return [_model(Schedule, d) async for d in self.schedules.find({"org_id": org_id})]

    async def delete_schedule(self, org_id: str, schedule_id: str) -> bool:
        return (await self.schedules.delete_one({"_id": schedule_id, "org_id": org_id})).deleted_count == 1

    async def due_schedules(self, now: Any) -> list[Schedule]:
        return [
            _model(Schedule, d)
            async for d in self.schedules.find({"enabled": True, "next_run_at": {"$lte": now}})
        ]

    async def advance_schedule(self, schedule_id: str, expected: Any, nxt: Any, run_id: str) -> bool:
        res = await self.schedules.update_one(
            {"_id": schedule_id, "next_run_at": expected},
            {"$set": {"next_run_at": nxt, "last_run_id": run_id}},
        )
        return res.modified_count == 1

    async def put_trigger(self, t: Trigger) -> Trigger:
        await self.triggers.replace_one({"_id": t.id}, _doc(t), upsert=True)
        return t

    async def list_triggers(self, org_id: str) -> list[Trigger]:
        return [_model(Trigger, d) async for d in self.triggers.find({"org_id": org_id})]

    async def get_trigger(self, trigger_id: str) -> Trigger | None:
        return _model(Trigger, await self.triggers.find_one({"_id": trigger_id}))

    async def delete_trigger(self, org_id: str, trigger_id: str) -> bool:
        return (await self.triggers.delete_one({"_id": trigger_id, "org_id": org_id})).deleted_count == 1

    async def touch_trigger(self, trigger_id: str) -> None:
        await self.triggers.update_one({"_id": trigger_id}, {"$set": {"last_fired_at": utcnow()}})
