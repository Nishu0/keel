"""Sign in with GitHub, Google or an email link. Sessions are httponly cookies.

The browser reaches these through the web app's /api/keel proxy, so the cookie
is first party to the web origin and the api never needs CORS for it.
"""

from __future__ import annotations

from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Cookie, HTTPException, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, EmailStr

from keel.accounts.oauth import PROVIDERS, OAuthError, check_state, exchange, make_state
from keel.accounts.service import SESSION_TTL, AuthError, SignedIn

from ..deps import SESSION_COOKIE, AppState, Signed, State

router = APIRouter(prefix="/v1", tags=["auth"])
STATE_COOKIE = "keel_oauth_state"


def _secure(st: AppState) -> bool:
    return st.public_url.startswith("https://")


def _land(st: AppState, token: str, to: str = "/app") -> RedirectResponse:
    r = RedirectResponse(f"{st.public_url.rstrip('/')}{to}", status_code=status.HTTP_303_SEE_OTHER)
    r.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        secure=_secure(st),
        samesite="lax",
        path="/",
    )
    r.delete_cookie(STATE_COOKIE, path="/")
    return r


def _fail(st: AppState, message: str) -> RedirectResponse:
    from urllib.parse import quote

    return RedirectResponse(f"{st.public_url.rstrip('/')}/sign-in?error={quote(message)}", status_code=303)


@router.get("/auth/providers")
async def providers() -> dict[str, bool]:
    """Which sign in options are configured, so the page only shows working buttons."""
    import os

    return {
        **{n: p.configured for n, p in PROVIDERS.items()},
        "email": bool(os.environ.get("KEEL_SESSION_SECRET")),
    }


class EmailIn(BaseModel):
    email: EmailStr


@router.post("/auth/email")
async def email_link(body: EmailIn, st: State) -> dict[str, str]:
    token = await st.svc.magic_link(body.email)
    link = f"{st.public_url.rstrip('/')}/api/keel/v1/auth/email/callback?token={token}"
    await st.mailer.send(
        body.email,
        "Your keel sign in link",
        f"Sign in to keel:\n\n{link}\n\nThe link works once and expires in 15 minutes. "
        "If you didn't ask for it, ignore this email.",
    )
    # same answer whether or not the address has an account
    return {"status": "sent"}


@router.get("/auth/email/callback")
async def email_callback(token: str, st: State) -> RedirectResponse:
    try:
        signed: SignedIn = await st.svc.use_magic_link(token)
    except AuthError as e:
        return _fail(st, str(e))
    return _land(st, await st.svc.start_session(signed.user.id, signed.org_id))


@router.post("/auth/logout")
async def logout(st: State, keel_session: Annotated[str | None, Cookie()] = None) -> JSONResponse:
    if keel_session:
        await st.svc.end_session(keel_session)
    r = JSONResponse({"status": "signed out"})
    r.delete_cookie(SESSION_COOKIE, path="/")
    return r


@router.get("/me")
async def me(c: Signed, st: State) -> dict[str, Any]:
    orgs = []
    for m in await st.accounts.orgs_for_user(c.user.id) if c.user else []:
        org = await st.accounts.get_org(m.org_id)
        if org:
            orgs.append({"id": org.id, "name": org.name, "plan": org.plan, "role": m.role})
    current = await st.accounts.get_org(c.org_id)
    return {
        "user": c.user.model_dump(include={"id", "email", "name", "avatar_url"}) if c.user else None,
        "org": {
            "id": c.org_id,
            "name": current.name if current else c.org_id,
            "plan": current.plan if current else "free",
        },
        "role": c.role,
        "orgs": orgs,
        "via": "session" if c.session_token else "api_key",
    }


class SwitchIn(BaseModel):
    org_id: str


@router.post("/me/org")
async def switch_org(body: SwitchIn, c: Signed, st: State, request: Request) -> dict[str, str]:
    if not c.session_token or not c.user:
        raise HTTPException(400, "api keys are bound to one org")
    try:
        await st.svc.switch_org(c.session_token, c.user.id, body.org_id)
    except AuthError as e:
        raise HTTPException(403, str(e)) from e
    return {"org_id": body.org_id}


# generic oauth routes last, so /auth/email/... above matches first


@router.get("/auth/{provider}/start")
async def start(provider: str, st: State) -> RedirectResponse:
    p = PROVIDERS.get(provider)
    if p is None or not p.configured:
        return _fail(st, f"{provider} sign in isn't set up on this server")
    try:
        state = make_state()
    except OAuthError as e:
        return _fail(st, str(e))
    r = RedirectResponse(p.authorize(st.public_url, state), status_code=303)
    r.set_cookie(
        STATE_COOKIE, state, max_age=600, httponly=True, secure=_secure(st), samesite="lax", path="/"
    )
    return r


@router.get("/auth/{provider}/callback")
async def callback(
    provider: str,
    st: State,
    code: str = "",
    state: str = "",
    error: str = "",
    keel_oauth_state: Annotated[str | None, Cookie()] = None,
) -> RedirectResponse:
    p = PROVIDERS.get(provider)
    if p is None:
        raise HTTPException(404)
    if error:
        return _fail(st, "sign in was cancelled")
    if not check_state(state, keel_oauth_state):
        return _fail(st, "that sign in attempt expired. Try again.")
    http = st.http or httpx.AsyncClient(timeout=15)
    try:
        profile = await exchange(p, code, st.public_url, http)
        signed = await st.svc.sign_in(
            p.name, profile.subject, profile.email, profile.name, profile.avatar_url
        )
    except (OAuthError, AuthError) as e:
        return _fail(st, str(e))
    finally:
        if st.http is None:
            await http.aclose()
    return _land(st, await st.svc.start_session(signed.user.id, signed.org_id))
