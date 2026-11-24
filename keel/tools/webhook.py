"""Remote tools over HTTPS.

keel POSTs the validated input as JSON and signs the request:

    X-Keel-Timestamp: <unix seconds>
    X-Keel-Signature: v1=<hex hmac_sha256(secret, "<timestamp>.<body>")>
    Idempotency-Key:  <call_id>        # same for every retry of one logical call

How responses are read:
- 2xx: the JSON body is the tool's output
- 4xx (except 408, 425, 429): the tool rejected the call, so it definitely
  didn't happen. The error goes back to the model.
- anything else, or a timeout: unknown. For external tools that is in doubt,
  and the reconcile endpoint is asked: GET <reconcile_url>?idempotency_key=...
  returns 200 with the output if it landed, 404 if it didn't.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from keel.tools.registry import Effect, Tool
from keel.worker.loop import ToolError

RETRYABLE_4XX = {408, 425, 429}


def sign(secret: str, timestamp: str, body: bytes) -> str:
    mac = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    return f"v1={mac}"


def verify(secret: str, timestamp: str, body: bytes, signature: str, tolerance_s: int = 300) -> bool:
    """For tool authors: check a request really came from keel and isn't a replay."""
    if abs(time.time() - int(timestamp)) > tolerance_s:
        return False
    return hmac.compare_digest(sign(secret, timestamp, body), signature)


@dataclass
class WebhookTool:
    name: str
    url: str
    signing_secret: str
    input_schema: dict[str, Any]
    effect: Effect = Effect.EXTERNAL
    description: str = ""
    reconcile_url: str | None = None
    timeout_s: float = 30.0
    client: httpx.AsyncClient | None = field(default=None, repr=False)

    def _client(self) -> httpx.AsyncClient:
        return self.client or httpx.AsyncClient(timeout=self.timeout_s)

    async def call(self, idempotency_key: str, **args: Any) -> Any:
        body = json.dumps(args, separators=(",", ":"), sort_keys=True).encode()
        ts = str(int(time.time()))
        headers = {
            "content-type": "application/json",
            "idempotency-key": idempotency_key,
            "x-keel-timestamp": ts,
            "x-keel-signature": sign(self.signing_secret, ts, body),
            "user-agent": "keel-webhook/0.1",
        }
        c = self._client()
        try:
            r = await c.post(self.url, content=body, headers=headers)
        finally:
            if self.client is None:
                await c.aclose()
        if 200 <= r.status_code < 300:
            return r.json() if r.content else None
        if 400 <= r.status_code < 500 and r.status_code not in RETRYABLE_4XX:
            raise ToolError(f"{self.name} rejected the call ({r.status_code}): {r.text[:500]}")
        # 5xx or throttled: the request may have been processed
        raise RuntimeError(f"{self.name} returned {r.status_code}")

    async def check(self, idempotency_key: str) -> Any | None:
        assert self.reconcile_url
        c = self._client()
        try:
            r = await c.get(self.reconcile_url, params={"idempotency_key": idempotency_key})
        finally:
            if self.client is None:
                await c.aclose()
        if r.status_code == 404:
            return None
        r.raise_for_status()  # anything else stays in doubt
        return r.json()

    def tool(self) -> Tool:
        if self.reconcile_url and self.effect is not Effect.EXTERNAL:
            raise ValueError("reconcile_url only makes sense for external tools")
        return Tool(
            name=self.name,
            fn=self.call,
            effect=self.effect,
            description=self.description,
            json_schema=self.input_schema,
            timeout_s=self.timeout_s,
            reconcile=self.check if self.reconcile_url else None,
            wants_key=True,
        )
