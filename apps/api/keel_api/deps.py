"""Request scoped dependencies: who is calling, for which org, with what role.

Two ways in:
- an api key, ``Authorization: Bearer kl_live_...``, scoped to one org and role
- a session cookie set by sign in, scoped to the org the session is working in
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass, field
from typing import Annotated, Any

import httpx
from fastapi import Depends, Header, HTTPException, Request, status

from keel.accounts.email import Mailer, mailer_from_env
from keel.accounts.models import User
from keel.accounts.service import Accounts
from keel.accounts.store import AccountStore, MemoryAccounts
from keel.security.crypto import Sealer, SecretsNotConfigured
from keel.store.base import AuditEntry, Store
from keel.tools.registry import Registry

from .rbac import Action, Role, can

SESSION_COOKIE = "keel_session"


@dataclass
class DevKey:
    """A fixed key from the environment for single org dev mode, and for tests."""

    id: str
    org_id: str
    prefix: str
    hash: str
    role: Role


@dataclass
class AppState:
    store: Store
    accounts: AccountStore = field(default_factory=MemoryAccounts)
    mailer: Mailer = field(default_factory=mailer_from_env)
    http: httpx.AsyncClient | None = None  # for oauth; injectable in tests
    public_url: str = field(
        default_factory=lambda: os.environ.get("KEEL_PUBLIC_URL", "http://localhost:3000")
    )
    dev_keys: dict[str, DevKey] = field(default_factory=dict)  # prefix -> key
    mcp_http: Any = None  # httpx2 client factory for mcp; injectable in tests
    _sealer: Sealer | None = None
    _base_tools: Registry | None = None

    def __post_init__(self) -> None:
        if self.mcp_http is None:
            from keel.tools.mcp import default_http

            self.mcp_http = default_http

    def base_tools(self) -> Registry:
        """keel's own tools: builtins, plus the sandbox when it's switched on."""
        if self._base_tools is None:
            from keel.tools.builtin import registry

            reg = registry.copy()
            if os.environ.get("KEEL_SANDBOX") == "docker":
                from keel.sandbox.tools import register

                register(reg)
            self._base_tools = reg
        return self._base_tools

    @property
    def svc(self) -> Accounts:
        return Accounts(self.accounts)

    @property
    def sealer(self) -> Sealer:
        if self._sealer is None:
            self._sealer = Sealer.from_env()
        return self._sealer

    def add_key(self, secret: str, org_id: str, role: Role, key_id: str = "key_dev") -> DevKey:
        k = DevKey(key_id, org_id, secret[:12], hashlib.sha256(secret.encode()).hexdigest(), role)
        self.dev_keys[k.prefix] = k
        return k


@dataclass
class Caller:
    org_id: str
    role: Role
    actor: str  # "key:<id>" or "usr:<id>"
    ip: str | None = None
    user: User | None = None
    session_token: str | None = None


def state(request: Request) -> AppState:
    return request.app.state.keel


async def caller(request: Request, authorization: Annotated[str | None, Header()] = None) -> Caller:
    st = state(request)
    ip = request.client.host if request.client else None

    if authorization and authorization.startswith("Bearer "):
        secret = authorization.removeprefix("Bearer ").strip()
        dev = st.dev_keys.get(secret[:12])
        if dev and dev.hash == hashlib.sha256(secret.encode()).hexdigest():
            return Caller(org_id=dev.org_id, role=dev.role, actor=f"key:{dev.id}", ip=ip)
        key = await st.svc.verify_key(secret)
        if key is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid api key")
        return Caller(org_id=key.org_id, role=key.role, actor=f"key:{key.id}", ip=ip)

    token = request.cookies.get(SESSION_COOKIE)
    if token:
        session = await st.svc.session(token)
        if session:
            member = await st.accounts.get_member(session.org_id, session.user_id)
            user = await st.accounts.get_user(session.user_id)
            if member and user:
                return Caller(
                    org_id=session.org_id,
                    role=member.role,
                    actor=f"usr:{user.id}",
                    ip=ip,
                    user=user,
                    session_token=token,
                )
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "sign in or send an api key")


def require(action: Action):
    def dep(c: Annotated[Caller, Depends(caller)]) -> Caller:
        if not can(c.role, action):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"role {c.role} cannot {action}")
        return c

    return dep


def sealer_or_503(st: AppState) -> Sealer:
    try:
        return st.sealer
    except SecretsNotConfigured as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from e


async def audit(st: AppState, c: Caller, action: str, target: str, **detail: object) -> None:
    await st.store.audit(
        AuditEntry(org_id=c.org_id, actor=c.actor, action=action, target=target, ip=c.ip, detail=detail)
    )


Signed = Annotated[Caller, Depends(caller)]
Admin = Annotated[Caller, Depends(require(Action.MANAGE_MEMBERS))]
ToolAdmin = Annotated[Caller, Depends(require(Action.MANAGE_TOOLS))]
Owner = Annotated[Caller, Depends(require(Action.BILLING))]
Viewer = Annotated[Caller, Depends(require(Action.VIEW))]
Developer = Annotated[Caller, Depends(require(Action.WRITE_AGENTS))]
Operator = Annotated[Caller, Depends(require(Action.OPERATE_RUNS))]
State = Annotated[AppState, Depends(state)]
