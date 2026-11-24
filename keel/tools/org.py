"""Build the tool set a run can use: keel's own tools plus the org's tools."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from keel.accounts.models import ToolDef
from keel.accounts.store import AccountStore
from keel.security.crypto import Sealer
from keel.tools import mcp
from keel.tools.registry import Effect, Registry, Tool
from keel.tools.webhook import WebhookTool

SecretFn = Callable[[str], Awaitable[str | None]]


def secret_reader(accounts: AccountStore, sealer: Sealer | None, org_id: str) -> SecretFn:
    async def read(name: str) -> str | None:
        if sealer is None:
            return None
        s = await accounts.get_secret(org_id, name)
        return sealer.open(org_id, s.name, s.ciphertext, s.nonce) if s else None

    return read


async def to_tool(d: ToolDef, secret: SecretFn, mcp_http: mcp.HttpFactory = mcp.default_http) -> Tool | None:
    effect = Effect(d.effect)
    if d.kind == "webhook":
        key = await secret(d.signing_secret) if d.signing_secret else None
        if not key:
            return None  # an unsigned webhook would be forgeable; skip it rather than send unsigned
        return WebhookTool(
            name=d.name,
            url=d.url,
            signing_secret=key,
            input_schema=d.input_schema,
            effect=effect,
            description=d.description,
            reconcile_url=d.reconcile_url if effect is Effect.EXTERNAL else None,
            timeout_s=d.timeout_s,
        ).tool()
    if d.kind == "mcp" and d.remote_name:
        headers = {}
        if d.auth_secret:
            token = await secret(d.auth_secret)
            if token:
                headers["Authorization"] = token if " " in token else f"Bearer {token}"
        return Tool(
            name=d.name,
            fn=mcp.make_caller(d.url, d.remote_name, headers, mcp_http),
            effect=effect,
            description=d.description,
            json_schema=d.input_schema,
            timeout_s=d.timeout_s,
            wants_key=True,
        )
    return None


async def registry_for(
    org_id: str,
    base: Registry,
    accounts: AccountStore,
    sealer: Sealer | None,
    mcp_http: mcp.HttpFactory = mcp.default_http,
) -> Registry:
    reg = base.copy()
    read = secret_reader(accounts, sealer, org_id)
    for d in await accounts.list_tools(org_id):
        t = await to_tool(d, read, mcp_http)
        if t is not None and t.name not in reg:
            reg.add(t)
    return reg
