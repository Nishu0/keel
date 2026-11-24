"""Tools that ship with keel and run inside the worker. All pure."""

from __future__ import annotations

import html
import re
from datetime import UTC, datetime
from typing import Any

from keel.security.net import BlockedAddress, safe_client
from keel.tools.registry import Registry

registry = Registry()

MAX_CHARS = 20_000
_TAGS = re.compile(r"<(script|style)[^>]*>.*?</\1>|<[^>]+>", re.S | re.I)
_WS = re.compile(r"\s+")


@registry.tool(effect="pure", timeout_s=20)
async def web_fetch(url: str) -> dict[str, Any]:
    """Fetch a public http(s) url and return its readable text, truncated to 20k characters."""
    if not url.startswith(("http://", "https://")):
        return {"error": "only http and https urls are allowed"}
    try:
        async with safe_client(follow_redirects=True, max_redirects=5, timeout=15) as c:
            r = await c.get(url, headers={"User-Agent": "keel-agent/0.1"})
    except BlockedAddress as e:
        return {"error": str(e)}
    ctype = r.headers.get("content-type", "")
    body = r.text
    if "html" in ctype:
        title = re.search(r"<title[^>]*>(.*?)</title>", body, re.S | re.I)
        text = _WS.sub(" ", html.unescape(_TAGS.sub(" ", body))).strip()
        return {
            "status": r.status_code,
            "title": html.unescape(title.group(1)).strip() if title else None,
            "text": text[:MAX_CHARS],
            "truncated": len(text) > MAX_CHARS,
        }
    return {
        "status": r.status_code,
        "content_type": ctype,
        "text": body[:MAX_CHARS],
        "truncated": len(body) > MAX_CHARS,
    }


@registry.tool(effect="pure")
async def current_time() -> str:
    """The current time in UTC, ISO 8601."""
    return datetime.now(UTC).isoformat(timespec="seconds")
