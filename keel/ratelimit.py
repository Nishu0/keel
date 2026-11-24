"""Fixed window rate limits, shared across api instances when Mongo is configured.

A window is identified by (scope, key, window start). The count is one atomic $inc on
a document with a TTL, so many api processes agree on it without coordination.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol


@dataclass(frozen=True)
class Limit:
    scope: str
    per: int  # requests allowed...
    window_s: int  # ...in this many seconds


class TooMany(Exception):
    def __init__(self, limit: Limit, retry_after: int) -> None:
        super().__init__(f"too many requests for {limit.scope}, try again in {retry_after}s")
        self.limit = limit
        self.retry_after = retry_after


class Limiter(Protocol):
    async def hit(self, limit: Limit, key: str) -> None:
        """Count one request; raise TooMany past the limit."""
        ...


def _window(limit: Limit, now: float) -> tuple[int, int]:
    start = int(now // limit.window_s) * limit.window_s
    return start, start + limit.window_s - int(now)


class MemoryLimiter:
    def __init__(self, clock: Any = time.time) -> None:
        self.counts: dict[str, int] = {}
        self.clock = clock

    async def hit(self, limit: Limit, key: str) -> None:
        start, retry = _window(limit, self.clock())
        k = f"{limit.scope}:{key}:{start}"
        n = self.counts[k] = self.counts.get(k, 0) + 1
        if len(self.counts) > 50_000:  # old windows: drop everything not in the current one
            self.counts = {kk: v for kk, v in self.counts.items() if kk.endswith(f":{start}")}
        if n > limit.per:
            raise TooMany(limit, max(retry, 1))


class MongoLimiter:
    def __init__(self, db: Any) -> None:
        self.col = db.rate_limits

    async def ensure_indexes(self) -> None:
        await self.col.create_index("expires", expireAfterSeconds=0)

    async def hit(self, limit: Limit, key: str) -> None:
        now = time.time()
        start, retry = _window(limit, now)
        doc = await self.col.find_one_and_update(
            {"_id": f"{limit.scope}:{key}:{start}"},
            {
                "$inc": {"n": 1},
                "$setOnInsert": {
                    "expires": datetime.fromtimestamp(start, UTC) + timedelta(seconds=limit.window_s * 2)
                },
            },
            upsert=True,
            return_document=True,
        )
        if doc["n"] > limit.per:
            raise TooMany(limit, max(retry, 1))


# the limits keel applies; generous for people, tight for anything anonymous
SIGN_IN_IP = Limit("sign_in_ip", 10, 60)
SIGN_IN_EMAIL = Limit("sign_in_email", 5, 3600)  # magic links to one address per hour
AUTH_CALLBACK_IP = Limit("auth_callback_ip", 30, 60)
HOOK_TRIGGER = Limit("hook_trigger", 60, 60)  # per trigger url
HOOK_IP = Limit("hook_ip", 120, 60)
API_ORG = Limit("api_org", 1200, 60)  # every authenticated call, per org
RUN_CREATE_ORG = Limit("run_create_org", 120, 60)
