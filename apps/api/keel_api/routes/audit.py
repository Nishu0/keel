from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query

from ..deps import Admin, State

router = APIRouter(prefix="/v1/audit", tags=["audit"])


@router.get("")
async def audit_log(
    c: Admin, st: State, limit: Annotated[int, Query(ge=1, le=500)] = 100
) -> list[dict[str, Any]]:
    """Who changed what. Admins and owners only."""
    return [e.__dict__ for e in await st.store.audit_log(c.org_id, limit)]
