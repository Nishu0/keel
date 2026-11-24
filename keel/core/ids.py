"""Identifiers.

``call_id`` is the heart of the at most once guarantee: the same logical tool
call always gets the same id, no matter which worker computes it or how many
times the run has been resumed.
"""

from __future__ import annotations

import hashlib
import os
import time

_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"  # crockford base32


def call_id(run_id: str, step: int, call_index: int) -> str:
    digest = hashlib.sha256(f"{run_id}:{step}:{call_index}".encode()).hexdigest()
    return f"tc_{digest[:24]}"


def new_id(prefix: str) -> str:
    """Time sortable id, ulid style: 48 bits of ms time then 80 random bits."""
    n = (int(time.time() * 1000) << 80) | int.from_bytes(os.urandom(10), "big")
    chars = []
    for _ in range(26):
        chars.append(_ALPHABET[n & 31])
        n >>= 5
    return f"{prefix}_{''.join(reversed(chars))}"
