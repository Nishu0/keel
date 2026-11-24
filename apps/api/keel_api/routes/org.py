"""Members, invites, api keys and secrets for the caller's org."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr

from keel.accounts.models import Membership, Role, Secret
from keel.accounts.plans import limits
from keel.accounts.service import AuthError
from keel.core.ids import new_id

from ..deps import Admin, Signed, State, ToolAdmin, Viewer, audit, sealer_or_503

router = APIRouter(prefix="/v1", tags=["org"])


# ---------- members ----------


@router.get("/members")
async def members(c: Viewer, st: State) -> dict[str, Any]:
    out = []
    for m in await st.accounts.list_members(c.org_id):
        u = await st.accounts.get_user(m.user_id)
        out.append(
            {"user_id": m.user_id, "role": m.role, "name": u.name if u else "", "email": u.email if u else ""}
        )
    invites = [
        {"email": i.email, "role": i.role, "expires_at": i.expires_at}
        for i in await st.accounts.list_invites(c.org_id)
    ]
    return {"members": out, "invites": invites}


class InviteIn(BaseModel):
    email: EmailStr
    role: Role = Role.DEVELOPER


@router.post("/members/invite", status_code=201)
async def invite(body: InviteIn, c: Admin, st: State) -> dict[str, str]:
    org = await st.accounts.get_org(c.org_id)
    if org is not None:
        seats = limits(org.plan).seats
        taken = len(await st.accounts.list_members(c.org_id)) + len(await st.accounts.list_invites(c.org_id))
        if seats is not None and taken >= seats:
            plural = "s" if seats != 1 else ""
            raise HTTPException(402, f"the {org.plan} plan has {seats} seat{plural}; upgrade to invite more")
    try:
        token = await st.svc.invite(c.org_id, body.email, body.role, c.actor)
    except AuthError as e:
        raise HTTPException(422, str(e)) from e
    link = f"{st.public_url.rstrip('/')}/api/keel/v1/invites/{token}/accept"
    await st.mailer.send(
        body.email,
        f"You're invited to {org.name if org else 'a keel org'}",
        f"Join {org.name if org else 'the org'} on keel as {body.role}:\n\n{link}\n\n"
        "The invite expires in 7 days.",
    )
    await audit(st, c, "member.invited", body.email, role=body.role)
    return {"status": "sent"}


@router.get("/invites/{token}/accept")
async def accept(token: str, c: Signed, st: State) -> RedirectResponse:
    """Open from the email while signed in. Joins the org and switches the session to it."""
    if not c.user:
        raise HTTPException(400, "sign in to accept an invite")
    try:
        org_id = await st.svc.accept_invite(token, c.user)
    except AuthError as e:
        raise HTTPException(403, str(e)) from e
    if c.session_token:
        await st.svc.switch_org(c.session_token, c.user.id, org_id)
    return RedirectResponse(f"{st.public_url.rstrip('/')}/app", status_code=303)


class RoleIn(BaseModel):
    role: Role


@router.patch("/members/{user_id}")
async def set_role(user_id: str, body: RoleIn, c: Admin, st: State) -> dict[str, str]:
    m = await st.accounts.get_member(c.org_id, user_id)
    if m is None:
        raise HTTPException(404, "not a member")
    if m.role is Role.OWNER or body.role is Role.OWNER:
        raise HTTPException(422, "ownership changes go through billing settings")
    await st.accounts.set_member(Membership(org_id=c.org_id, user_id=user_id, role=body.role))
    await audit(st, c, "member.role_changed", user_id, role=body.role)
    return {"user_id": user_id, "role": body.role}


@router.delete("/members/{user_id}", status_code=204)
async def remove(user_id: str, c: Admin, st: State) -> None:
    m = await st.accounts.get_member(c.org_id, user_id)
    if m is None:
        raise HTTPException(404, "not a member")
    if m.role is Role.OWNER:
        raise HTTPException(422, "the owner can't be removed")
    await st.accounts.remove_member(c.org_id, user_id)
    await audit(st, c, "member.removed", user_id)


# ---------- api keys ----------


@router.get("/api-keys")
async def keys(c: Admin, st: State) -> list[dict[str, Any]]:
    return [
        k.model_dump(include={"id", "name", "prefix", "role", "created_at", "last_used_at", "revoked_at"})
        for k in await st.accounts.list_keys(c.org_id)
    ]


class KeyIn(BaseModel):
    name: str
    role: Role = Role.DEVELOPER


@router.post("/api-keys", status_code=201)
async def create_key(body: KeyIn, c: Admin, st: State) -> dict[str, Any]:
    if body.role is Role.OWNER:
        raise HTTPException(422, "keys can be admin at most")
    secret, key = await st.svc.create_key(c.org_id, body.name.strip() or "Unnamed key", body.role, c.actor)
    await audit(st, c, "api_key.created", key.id, role=body.role)
    return {"id": key.id, "prefix": key.prefix, "role": key.role, "secret": secret}


@router.delete("/api-keys/{key_id}", status_code=204)
async def revoke_key(key_id: str, c: Admin, st: State) -> None:
    if not await st.accounts.revoke_key(c.org_id, key_id):
        raise HTTPException(404, "no active key with that id")
    await audit(st, c, "api_key.revoked", key_id)


# ---------- secrets ----------


@router.get("/secrets")
async def secrets(c: ToolAdmin, st: State) -> list[dict[str, Any]]:
    # values are write only: names and metadata come back, never the value
    return [
        s.model_dump(include={"id", "name", "created_by", "updated_at"})
        for s in await st.accounts.list_secrets(c.org_id)
    ]


class SecretIn(BaseModel):
    name: str
    value: str


@router.post("/secrets", status_code=status.HTTP_201_CREATED)
async def put_secret(body: SecretIn, c: ToolAdmin, st: State) -> dict[str, str]:
    name = body.name.strip().upper().replace(" ", "_")
    if not name or not body.value:
        raise HTTPException(422, "name and value are required")
    ct, nonce = sealer_or_503(st).seal(c.org_id, name, body.value)
    s = await st.accounts.put_secret(
        Secret(id=new_id("sec"), org_id=c.org_id, name=name, ciphertext=ct, nonce=nonce, created_by=c.actor)
    )
    await audit(st, c, "secret.updated", s.id, name=name)
    return {"id": s.id, "name": name}


@router.delete("/secrets/{secret_id}", status_code=204)
async def delete_secret(secret_id: str, c: ToolAdmin, st: State) -> None:
    if not await st.accounts.delete_secret(c.org_id, secret_id):
        raise HTTPException(404, "no secret with that id")
    await audit(st, c, "secret.deleted", secret_id)
