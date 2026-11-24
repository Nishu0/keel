"""Account storage: memory for tests and dev, mongo for real deployments.

Every org owned record is looked up with its org id. Tokens (sessions, invites,
magic links, api keys) are stored only as sha256 hashes.
"""

from __future__ import annotations

import hashlib
from copy import deepcopy
from datetime import datetime
from typing import Any, Protocol

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


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class AccountStore(Protocol):
    # users
    async def create_user(self, user: User) -> User: ...
    async def get_user(self, user_id: str) -> User | None: ...
    async def user_by_email(self, email: str) -> User | None: ...
    async def user_by_identity(self, provider: str, subject: str) -> User | None: ...
    async def add_identity(self, user_id: str, identity: Identity) -> None: ...
    # orgs and members
    async def create_org(self, org: Org) -> Org: ...
    async def get_org(self, org_id: str) -> Org | None: ...
    async def update_org(self, org_id: str, **fields: Any) -> None: ...
    async def org_by_stripe_customer(self, customer_id: str) -> Org | None: ...
    async def set_member(self, m: Membership) -> None: ...
    async def get_member(self, org_id: str, user_id: str) -> Membership | None: ...
    async def list_members(self, org_id: str) -> list[Membership]: ...
    async def remove_member(self, org_id: str, user_id: str) -> None: ...
    async def orgs_for_user(self, user_id: str) -> list[Membership]: ...
    # sessions
    async def create_session(self, s: Session) -> None: ...
    async def get_session(self, session_id: str) -> Session | None: ...
    async def set_session_org(self, session_id: str, org_id: str) -> None: ...
    async def delete_session(self, session_id: str) -> None: ...
    # api keys
    async def create_key(self, key: ApiKey) -> None: ...
    async def key_by_prefix(self, prefix: str) -> ApiKey | None: ...
    async def list_keys(self, org_id: str) -> list[ApiKey]: ...
    async def revoke_key(self, org_id: str, key_id: str) -> bool: ...
    async def touch_key(self, key_id: str) -> None: ...
    # invites and magic links
    async def create_invite(self, inv: Invite) -> None: ...
    async def get_invite(self, invite_id: str) -> Invite | None: ...
    async def list_invites(self, org_id: str) -> list[Invite]: ...
    async def accept_invite(self, invite_id: str) -> None: ...
    async def create_magic_link(self, link: MagicLink) -> None: ...
    async def use_magic_link(self, link_id: str) -> MagicLink | None:
        """Mark used and return it, once. Expired or used links return None."""
        ...

    # secrets
    async def put_secret(self, s: Secret) -> Secret: ...
    async def list_secrets(self, org_id: str) -> list[Secret]: ...
    async def get_secret(self, org_id: str, name: str) -> Secret | None: ...
    async def delete_secret(self, org_id: str, secret_id: str) -> bool: ...

    # org tools
    async def put_tool(self, t: ToolDef) -> ToolDef: ...
    async def list_tools(self, org_id: str) -> list[ToolDef]: ...
    async def delete_tools(
        self, org_id: str, *, tool_id: str | None = None, server: str | None = None
    ) -> int: ...


class MemoryAccounts:
    def __init__(self) -> None:
        self.users: dict[str, User] = {}
        self.orgs: dict[str, Org] = {}
        self.members: dict[tuple[str, str], Membership] = {}
        self.sessions: dict[str, Session] = {}
        self.keys: dict[str, ApiKey] = {}
        self.invites: dict[str, Invite] = {}
        self.links: dict[str, MagicLink] = {}
        self.secrets: dict[str, Secret] = {}
        self.tools: dict[str, ToolDef] = {}
        self.schedules: dict[str, Schedule] = {}
        self.triggers: dict[str, Trigger] = {}

    @staticmethod
    def _c(x: Any) -> Any:
        return deepcopy(x)

    async def create_user(self, user: User) -> User:
        if await self.user_by_email(user.email):
            raise ValueError("email already registered")
        self.users[user.id] = self._c(user)
        return user

    async def get_user(self, user_id: str) -> User | None:
        return self._c(self.users.get(user_id))

    async def user_by_email(self, email: str) -> User | None:
        e = email.lower()
        return self._c(next((u for u in self.users.values() if u.email.lower() == e), None))

    async def user_by_identity(self, provider: str, subject: str) -> User | None:
        for u in self.users.values():
            if any(i.provider == provider and i.subject == subject for i in u.identities):
                return self._c(u)
        return None

    async def add_identity(self, user_id: str, identity: Identity) -> None:
        u = self.users[user_id]
        if not any(i.provider == identity.provider and i.subject == identity.subject for i in u.identities):
            u.identities.append(identity)

    async def create_org(self, org: Org) -> Org:
        self.orgs[org.id] = self._c(org)
        return org

    async def get_org(self, org_id: str) -> Org | None:
        return self._c(self.orgs.get(org_id))

    async def update_org(self, org_id: str, **fields: Any) -> None:
        o = self.orgs[org_id]
        self.orgs[org_id] = o.model_copy(update=fields)

    async def org_by_stripe_customer(self, customer_id: str) -> Org | None:
        return self._c(next((o for o in self.orgs.values() if o.stripe_customer_id == customer_id), None))

    async def set_member(self, m: Membership) -> None:
        self.members[(m.org_id, m.user_id)] = self._c(m)

    async def get_member(self, org_id: str, user_id: str) -> Membership | None:
        return self._c(self.members.get((org_id, user_id)))

    async def list_members(self, org_id: str) -> list[Membership]:
        return [self._c(m) for (o, _), m in self.members.items() if o == org_id]

    async def remove_member(self, org_id: str, user_id: str) -> None:
        self.members.pop((org_id, user_id), None)

    async def orgs_for_user(self, user_id: str) -> list[Membership]:
        return [self._c(m) for (_, u), m in self.members.items() if u == user_id]

    async def create_session(self, s: Session) -> None:
        self.sessions[s.id] = self._c(s)

    async def get_session(self, session_id: str) -> Session | None:
        s = self.sessions.get(session_id)
        if s is None or s.expires_at <= utcnow():
            return None
        return self._c(s)

    async def set_session_org(self, session_id: str, org_id: str) -> None:
        self.sessions[session_id].org_id = org_id

    async def delete_session(self, session_id: str) -> None:
        self.sessions.pop(session_id, None)

    async def create_key(self, key: ApiKey) -> None:
        self.keys[key.id] = self._c(key)

    async def key_by_prefix(self, prefix: str) -> ApiKey | None:
        return self._c(next((k for k in self.keys.values() if k.prefix == prefix), None))

    async def list_keys(self, org_id: str) -> list[ApiKey]:
        return [self._c(k) for k in self.keys.values() if k.org_id == org_id]

    async def revoke_key(self, org_id: str, key_id: str) -> bool:
        k = self.keys.get(key_id)
        if k is None or k.org_id != org_id or k.revoked_at:
            return False
        k.revoked_at = utcnow()
        return True

    async def touch_key(self, key_id: str) -> None:
        if key_id in self.keys:
            self.keys[key_id].last_used_at = utcnow()

    async def create_invite(self, inv: Invite) -> None:
        self.invites[inv.id] = self._c(inv)

    async def get_invite(self, invite_id: str) -> Invite | None:
        return self._c(self.invites.get(invite_id))

    async def list_invites(self, org_id: str) -> list[Invite]:
        return [self._c(i) for i in self.invites.values() if i.org_id == org_id and not i.accepted_at]

    async def accept_invite(self, invite_id: str) -> None:
        self.invites[invite_id].accepted_at = utcnow()

    async def create_magic_link(self, link: MagicLink) -> None:
        self.links[link.id] = self._c(link)

    async def use_magic_link(self, link_id: str) -> MagicLink | None:
        link = self.links.get(link_id)
        if link is None or link.used_at or link.expires_at <= utcnow():
            return None
        link.used_at = utcnow()
        return self._c(link)

    async def put_secret(self, s: Secret) -> Secret:
        existing = next((x for x in self.secrets.values() if x.org_id == s.org_id and x.name == s.name), None)
        if existing:
            s = s.model_copy(update={"id": existing.id})
        self.secrets[s.id] = self._c(s)
        return s

    async def list_secrets(self, org_id: str) -> list[Secret]:
        return [self._c(s) for s in self.secrets.values() if s.org_id == org_id]

    async def get_secret(self, org_id: str, name: str) -> Secret | None:
        return self._c(
            next((s for s in self.secrets.values() if s.org_id == org_id and s.name == name), None)
        )

    async def delete_secret(self, org_id: str, secret_id: str) -> bool:
        s = self.secrets.get(secret_id)
        if s is None or s.org_id != org_id:
            return False
        del self.secrets[secret_id]
        return True

    async def put_tool(self, t: ToolDef) -> ToolDef:
        existing = next((x for x in self.tools.values() if x.org_id == t.org_id and x.name == t.name), None)
        if existing:
            t = t.model_copy(update={"id": existing.id})
        self.tools[t.id] = self._c(t)
        return t

    async def list_tools(self, org_id: str) -> list[ToolDef]:
        return sorted((self._c(t) for t in self.tools.values() if t.org_id == org_id), key=lambda t: t.name)

    async def delete_tools(
        self, org_id: str, *, tool_id: str | None = None, server: str | None = None
    ) -> int:
        doomed = [
            k
            for k, t in self.tools.items()
            if t.org_id == org_id and ((tool_id and t.id == tool_id) or (server and t.server == server))
        ]
        for k in doomed:
            del self.tools[k]
        return len(doomed)

    async def put_schedule(self, s: Schedule) -> Schedule:
        self.schedules[s.id] = self._c(s)
        return s

    async def list_schedules(self, org_id: str) -> list[Schedule]:
        return [self._c(s) for s in self.schedules.values() if s.org_id == org_id]

    async def delete_schedule(self, org_id: str, schedule_id: str) -> bool:
        s = self.schedules.get(schedule_id)
        if s is None or s.org_id != org_id:
            return False
        del self.schedules[schedule_id]
        return True

    async def due_schedules(self, now: datetime) -> list[Schedule]:
        return [self._c(s) for s in self.schedules.values() if s.enabled and s.next_run_at <= now]

    async def advance_schedule(
        self, schedule_id: str, expected: datetime, nxt: datetime, run_id: str
    ) -> bool:
        s = self.schedules.get(schedule_id)
        if s is None or s.next_run_at != expected:
            return False
        s.next_run_at, s.last_run_id = nxt, run_id
        return True

    async def put_trigger(self, t: Trigger) -> Trigger:
        self.triggers[t.id] = self._c(t)
        return t

    async def list_triggers(self, org_id: str) -> list[Trigger]:
        return [self._c(t) for t in self.triggers.values() if t.org_id == org_id]

    async def get_trigger(self, trigger_id: str) -> Trigger | None:
        return self._c(self.triggers.get(trigger_id))

    async def delete_trigger(self, org_id: str, trigger_id: str) -> bool:
        t = self.triggers.get(trigger_id)
        if t is None or t.org_id != org_id:
            return False
        del self.triggers[trigger_id]
        return True

    async def touch_trigger(self, trigger_id: str) -> None:
        if trigger_id in self.triggers:
            self.triggers[trigger_id].last_fired_at = utcnow()
