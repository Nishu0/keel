"""Mask secrets before anything is written to the event log.

Two layers:
1. exact values: every secret decrypted for this run is masked wherever it appears
2. patterns: common credential shapes, for secrets keel never saw (a tool that
   echoes back a token, a model that repeats one from a web page)
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any

MASK = "[redacted]"

PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}"),  # anthropic
    re.compile(r"sk-(?:proj-)?[A-Za-z0-9_\-]{20,}"),  # openai style
    re.compile(r"kl_(?:live|test)_[A-Za-z0-9_\-]{12,}"),  # keel api keys
    re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}"),  # github
    re.compile(r"xox[abprs]-[A-Za-z0-9\-]{10,}"),  # slack
    re.compile(r"AKIA[0-9A-Z]{16}"),  # aws access key id
    re.compile(r"AIza[0-9A-Za-z_\-]{35}"),  # google
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._\-]{20,}"),
]

SENSITIVE_KEYS = re.compile(
    r"(?i)^(authorization|api[_-]?key|secret|password|passwd|token|access[_-]?token|private[_-]?key)$"
)


# provider blocks that are signed and must never be modified
OPAQUE_BLOCKS = {"thinking", "redacted_thinking"}


class Redactor:
    def __init__(self, secrets: Iterable[str] = ()) -> None:
        # longest first so a secret that contains another is masked whole
        self.secrets = sorted({s for s in secrets if len(s) >= 6}, key=len, reverse=True)

    def text(self, s: str) -> str:
        for secret in self.secrets:
            s = s.replace(secret, MASK)
        for p in PATTERNS:
            s = p.sub(MASK, s)
        return s

    def __call__(self, value: Any) -> Any:
        if isinstance(value, str):
            return self.text(value)
        if isinstance(value, dict):
            if value.get("type") in OPAQUE_BLOCKS:
                # signed by the provider and replayed byte for byte; editing any field breaks the next turn
                return value
            return {
                k: (
                    MASK if isinstance(k, str) and SENSITIVE_KEYS.match(k) and isinstance(v, str) else self(v)
                )
                for k, v in value.items()
            }
        if isinstance(value, list | tuple):
            return [self(v) for v in value]
        return value
