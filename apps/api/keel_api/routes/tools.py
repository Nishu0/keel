"""The org's tools: keel's builtins, https webhooks and MCP servers."""

from __future__ import annotations

import re
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, HttpUrl

from keel.accounts.models import ToolDef
from keel.core.ids import new_id
from keel.security.net import BlockedAddress, check_url
from keel.tools import mcp
from keel.tools.org import registry_for, secret_reader, to_tool
from keel.tools.registry import ToolInputError

from ..deps import State, ToolAdmin, Viewer, audit, sealer_or_503

router = APIRouter(prefix="/v1/tools", tags=["tools"])
NAME = re.compile(r"^[a-zA-Z][a-zA-Z0-9_-]{0,63}$")
Effect = Literal["pure", "sandboxed", "external"]


def _public(d: ToolDef) -> dict[str, Any]:
    return d.model_dump(exclude={"org_id"})


@router.get("")
async def list_tools(c: Viewer, st: State) -> dict[str, Any]:
    builtin = [
        {"name": t.name, "effect": t.effect.value, "description": t.description, "kind": "builtin"}
        for t in (st.base_tools()._tools.values())
    ]
    return {"builtin": builtin, "org": [_public(d) for d in await st.accounts.list_tools(c.org_id)]}


class WebhookIn(BaseModel):
    name: str
    url: HttpUrl
    description: str = ""
    effect: Effect = "external"
    input_schema: dict[str, Any] = Field(default_factory=lambda: {"type": "object", "properties": {}})
    reconcile_url: HttpUrl | None = None
    signing_secret: str  # name of an org secret holding the hmac key
    timeout_s: float = Field(30.0, gt=0, le=300)


async def _public_or_422(*urls: str | None) -> None:
    for u in urls:
        if u:
            try:
                await check_url(u)
            except BlockedAddress as e:
                raise HTTPException(422, str(e)) from e


@router.post("/webhook", status_code=201)
async def add_webhook(body: WebhookIn, c: ToolAdmin, st: State) -> dict[str, Any]:
    if not NAME.match(body.name):
        raise HTTPException(422, "tool names start with a letter and use letters, digits, - and _")
    if body.url.scheme != "https" and body.url.host not in ("localhost", "127.0.0.1"):
        raise HTTPException(422, "webhook tools must use https")
    await _public_or_422(str(body.url), str(body.reconcile_url) if body.reconcile_url else None)
    if not await st.accounts.get_secret(c.org_id, body.signing_secret):
        raise HTTPException(
            422, f"add a secret named {body.signing_secret} first; keel signs every call with it"
        )
    d = await st.accounts.put_tool(
        ToolDef(
            id=new_id("tool"),
            org_id=c.org_id,
            name=body.name,
            kind="webhook",
            description=body.description,
            effect=body.effect,
            input_schema=body.input_schema,
            url=str(body.url),
            reconcile_url=str(body.reconcile_url) if body.reconcile_url else None,
            signing_secret=body.signing_secret,
            timeout_s=body.timeout_s,
        )
    )
    await audit(st, c, "tool.added", d.id, name=d.name, kind="webhook")
    return _public(d)


class McpIn(BaseModel):
    server: str  # short name, prefixes its tools: github__create_issue
    url: HttpUrl
    auth_secret: str | None = None  # org secret sent as the Authorization header


@router.post("/mcp", status_code=201)
async def add_mcp(body: McpIn, c: ToolAdmin, st: State) -> dict[str, Any]:
    if not re.match(r"^[a-z][a-z0-9-]{0,30}$", body.server):
        raise HTTPException(422, "server names are short, lowercase, letters, digits and -")
    await _public_or_422(str(body.url))
    headers = {}
    if body.auth_secret:
        token = await secret_reader(st.accounts, sealer_or_503(st), c.org_id)(body.auth_secret)
        if token is None:
            raise HTTPException(422, f"no secret named {body.auth_secret}")
        headers["Authorization"] = token if " " in token else f"Bearer {token}"
    try:
        found = await mcp.discover(str(body.url), headers, st.mcp_http)
    except Exception as e:  # anything from dns to a bad handshake
        raise HTTPException(502, f"couldn't list tools on {body.url}: {type(e).__name__}") from e
    if not found:
        raise HTTPException(422, "the server answered but lists no tools")

    await st.accounts.delete_tools(c.org_id, server=body.server)  # re-adding refreshes the list
    saved = []
    for f in found:
        saved.append(
            await st.accounts.put_tool(
                ToolDef(
                    id=new_id("tool"),
                    org_id=c.org_id,
                    name=mcp.tool_name(body.server, f.remote_name),
                    kind="mcp",
                    description=f.description,
                    effect="pure" if f.read_only else "external",
                    input_schema=f.input_schema,
                    url=str(body.url),
                    server=body.server,
                    remote_name=f.remote_name,
                    auth_secret=body.auth_secret,
                )
            )
        )
    await audit(st, c, "tool.mcp_connected", body.server, url=str(body.url), tools=len(saved))
    return {"server": body.server, "tools": [_public(d) for d in saved]}


class EffectIn(BaseModel):
    effect: Effect


@router.patch("/{tool_id}")
async def set_effect(tool_id: str, body: EffectIn, c: ToolAdmin, st: State) -> dict[str, Any]:
    d = next((t for t in await st.accounts.list_tools(c.org_id) if t.id == tool_id), None)
    if d is None:
        raise HTTPException(404, "no tool with that id")
    d = await st.accounts.put_tool(d.model_copy(update={"effect": body.effect}))
    await audit(st, c, "tool.effect_changed", d.id, effect=body.effect)
    return _public(d)


@router.delete("/{tool_id}", status_code=204)
async def remove_tool(tool_id: str, c: ToolAdmin, st: State) -> None:
    if not await st.accounts.delete_tools(c.org_id, tool_id=tool_id):
        raise HTTPException(404, "no tool with that id")
    await audit(st, c, "tool.removed", tool_id)


@router.delete("/mcp/{server}", status_code=204)
async def remove_server(server: str, c: ToolAdmin, st: State) -> None:
    if not await st.accounts.delete_tools(c.org_id, server=server):
        raise HTTPException(404, "no server with that name")
    await audit(st, c, "tool.mcp_removed", server)


class TestIn(BaseModel):
    input: dict[str, Any] = Field(default_factory=dict)


@router.post("/{tool_id}/test")
async def test_tool(tool_id: str, body: TestIn, c: ToolAdmin, st: State) -> dict[str, Any]:
    """Call the tool once, outside any run. External tools really do their thing, so the ui asks first."""
    d = next((t for t in await st.accounts.list_tools(c.org_id) if t.id == tool_id), None)
    if d is None:
        raise HTTPException(404, "no tool with that id")
    tool = await to_tool(d, secret_reader(st.accounts, sealer_or_503(st), c.org_id), st.mcp_http)
    if tool is None:
        raise HTTPException(422, "this tool is missing its signing secret")
    try:
        args = tool.validate(body.input)
        out = await tool(args, f"test_{new_id('call')}")
    except ToolInputError as e:
        raise HTTPException(422, str(e)) from e
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
    await audit(st, c, "tool.tested", d.id)
    return {"ok": True, "output": out}


async def tools_for_org(st: Any, org_id: str):
    """What a worker hands the run loop: builtins plus this org's tools."""
    try:
        sealer = st.sealer
    except Exception:
        sealer = None
    return await registry_for(org_id, st.base_tools(), st.accounts, sealer, st.mcp_http)
