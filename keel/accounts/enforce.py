"""Plan limits inside the runtime: concurrency in the scheduler, token quota at each step."""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable

from keel.accounts.billing import usage_this_month
from keel.accounts.plans import limits
from keel.accounts.store import AccountStore
from keel.store.base import Store

UNLIMITED = 10_000


def concurrency_for(accounts: AccountStore) -> Callable[[str], Awaitable[int]]:
    async def get(org_id: str) -> int:
        org = await accounts.get_org(org_id)
        return limits(org.plan).concurrent_runs if org else UNLIMITED

    return get


def quota_check(
    accounts: AccountStore, store: Store, ttl_s: float = 30.0
) -> Callable[[str], Awaitable[str | None]]:
    """Before each model call: has this org used its monthly tokens? Cached briefly, since
    folding a month of runs on every step would cost more than the step."""
    cache: dict[str, tuple[float, str | None]] = {}

    async def check(org_id: str) -> str | None:
        hit = cache.get(org_id)
        if hit and time.monotonic() - hit[0] < ttl_s:
            return hit[1]
        org = await accounts.get_org(org_id)
        reason = None
        if org is not None:
            lim = limits(org.plan)
            used = await usage_this_month(store, org_id)
            if used.tokens >= lim.tokens_per_month:
                reason = f"monthly token quota of the {org.plan} plan is used up"
        cache[org_id] = (time.monotonic(), reason)
        return reason

    return check
