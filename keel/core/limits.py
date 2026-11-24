"""Keep events under the store's document limit (Mongo's is 16 MB).

A tool can return anything: a 40 MB page, a huge query result. Oversized values are
replaced, once, before they're written, with a marker and a preview. The model and the
log see the same capped value, so a resumed run reads exactly what the live run did.

Model events are never trimmed: their content blocks go back to the provider byte for
byte (signed thinking must not change). They are bounded by max output tokens anyway,
and only a hard stop applies.
"""

from __future__ import annotations

import json
import os
from typing import Any

MAX_VALUE_BYTES = int(os.environ.get("KEEL_MAX_TOOL_OUTPUT_BYTES", str(256 * 1024)))
PREVIEW_CHARS = 16_000
HARD_EVENT_BYTES = 12 * 1024 * 1024  # leaves room under mongo's 16 MB


class EventTooLarge(ValueError):
    pass


def size(v: Any) -> int:
    return len(json.dumps(v, default=str, separators=(",", ":")).encode())


def cap(value: Any, limit: int = MAX_VALUE_BYTES) -> Any:
    """The value itself if it's small enough, otherwise a marker the model can read."""
    n = size(value)
    if n <= limit:
        return value
    text = value if isinstance(value, str) else json.dumps(value, default=str)
    return {
        "truncated": True,
        "original_bytes": n,
        "note": f"output was {n:,} bytes; keel keeps the first {PREVIEW_CHARS:,} characters",
        "preview": text[:PREVIEW_CHARS],
    }


def bound_payload(payload: dict[str, Any], *, trimmable: bool) -> dict[str, Any]:
    """Cap the large fields of an event payload. Raises EventTooLarge if that isn't enough."""
    if trimmable and size(payload) > MAX_VALUE_BYTES:
        payload = dict(payload)
        for k in sorted(payload, key=lambda k: size(payload[k]), reverse=True):
            if size(payload) <= MAX_VALUE_BYTES:
                break
            payload[k] = cap(payload[k], MAX_VALUE_BYTES // 2)
    n = size(payload)
    if n > HARD_EVENT_BYTES:
        raise EventTooLarge(f"event payload is {n:,} bytes, over the {HARD_EVENT_BYTES:,} byte limit")
    return payload
