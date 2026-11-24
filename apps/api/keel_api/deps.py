"""Request scoped dependencies: who is calling, for which org, with what role."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from keel.store.base import AuditEntry, Store

from .rbac import Action, Role, can


@dataclass
class ApiKey:
    id: str
    org_id: str
    prefix: str
    hash: str
    role: Role
    revoked: bool = False


@dataclass
class AppState:
    store: Store
    keys: dict[str, ApiKey] = field(default_factory=dict)  # prefix -> key

    def add_key(self, secret: str, org_id: str, role: Role, key_id: str = "key_dev") -> ApiKey:
        k = ApiKey(key_id, org_id, prefix_of(secret), hash_key(secret), role)
        self.keys[k.prefix] = k
        return k


def hash_key(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def prefix_of(secret: str) -> str:
    # kl_live_ab12...: lookup by the first 12 characters, verify by hash
    return secret[:12]


@dataclass
class Caller:
    org_id: str
    role: Role
    actor: str  # "key:<id>" or "usr:<id>"
    ip: str | None = None


def state(request: Request) -> AppState:
    return request.app.state.keel


def caller(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> Caller:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    secret = authorization.removeprefix("Bearer ").strip()
    key = state(request).keys.get(prefix_of(secret))
    if key is None or key.revoked or key.hash != hash_key(secret):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid api key")
    ip = request.client.host if request.client else None
    return Caller(org_id=key.org_id, role=key.role, actor=f"key:{key.id}", ip=ip)


def require(action: Action):
    def dep(c: Annotated[Caller, Depends(caller)]) -> Caller:
        if not can(c.role, action):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"role {c.role} cannot {action}")
        return c

    return dep


async def audit(st: AppState, c: Caller, action: str, target: str, **detail: object) -> None:
    await st.store.audit(
        AuditEntry(org_id=c.org_id, actor=c.actor, action=action, target=target, ip=c.ip, detail=detail)
    )


Admin = Annotated[Caller, Depends(require(Action.MANAGE_MEMBERS))]
Viewer = Annotated[Caller, Depends(require(Action.VIEW))]
Developer = Annotated[Caller, Depends(require(Action.WRITE_AGENTS))]
Operator = Annotated[Caller, Depends(require(Action.OPERATE_RUNS))]
State = Annotated[AppState, Depends(state)]
