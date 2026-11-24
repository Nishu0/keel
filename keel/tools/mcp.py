"""MCP servers as tool sources, over streamable HTTP.

keel connects as an MCP client, lists the server's tools once at registration,
and opens a short session per call. Tools the server marks read only become
``pure``; everything else defaults to ``external``, so an in doubt call waits for
a person instead of being sent twice. The call id goes along in ``_meta`` as an
idempotency key for servers that honour it.
"""

from __future__ import annotations

import json
import re
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

import httpx2
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from keel.security.net import guard
from keel.worker.loop import ToolError

HttpFactory = Callable[[dict[str, str]], httpx2.AsyncClient]
NAME_OK = re.compile(r"[^a-zA-Z0-9_-]+")


def default_http(headers: dict[str, str]) -> httpx2.AsyncClient:
    # the server url is user supplied, so connections to private addresses are refused
    transport = guard(httpx2.AsyncHTTPTransport(trust_env=False))
    return httpx2.AsyncClient(
        headers=headers, timeout=httpx2.Timeout(30.0, read=300.0), transport=transport, trust_env=False
    )


@asynccontextmanager
async def session(
    url: str, headers: dict[str, str] | None = None, http: HttpFactory = default_http
) -> AsyncIterator[ClientSession]:
    client = http(headers or {})
    async with client, streamable_http_client(url, http_client=client) as streams:
        read, write = streams[0], streams[1]
        async with ClientSession(read, write) as s:
            await s.initialize()
            yield s


@dataclass
class Discovered:
    remote_name: str
    description: str
    input_schema: dict[str, Any]
    read_only: bool


async def discover(
    url: str, headers: dict[str, str] | None = None, http: HttpFactory = default_http
) -> list[Discovered]:
    async with session(url, headers, http) as s:
        listed = await s.list_tools()
    out = []
    for t in listed.tools:
        ann = t.annotations
        out.append(
            Discovered(
                remote_name=t.name,
                description=(t.description or t.title or "").strip(),
                input_schema=t.input_schema or {"type": "object", "properties": {}},
                read_only=bool(ann and getattr(ann, "read_only_hint", False)),
            )
        )
    return out


def tool_name(server: str, remote: str) -> str:
    """Names the model sees: `server__tool`, safe for every provider's tool name rules."""
    return NAME_OK.sub("_", f"{server}__{remote}")[:64]


def make_caller(
    url: str, remote: str, headers: dict[str, str] | None = None, http: HttpFactory = default_http
):
    async def call(idempotency_key: str, **args: Any) -> Any:
        async with session(url, headers, http) as s:
            res = await s.call_tool(remote, args, meta={"keel/idempotency_key": idempotency_key})
        content = getattr(res, "content", None) or []
        text = "\n".join(getattr(c, "text", "") for c in content if getattr(c, "type", "") == "text").strip()
        if getattr(res, "is_error", False):
            # the server answered and said no: a definite failure the model should see
            raise ToolError(text or f"{remote} failed")
        structured = getattr(res, "structured_content", None)
        if structured is not None:
            return structured
        try:
            return json.loads(text) if text else None
        except ValueError:
            return text

    return call
