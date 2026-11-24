"""GitHub and Google sign in (OAuth 2 authorization code flow)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import time
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx


@dataclass
class Profile:
    subject: str
    email: str
    name: str
    avatar_url: str | None


@dataclass
class Provider:
    name: str
    authorize_url: str
    token_url: str
    scope: str
    client_id_env: str
    client_secret_env: str

    @property
    def client_id(self) -> str:
        return os.environ.get(self.client_id_env, "")

    @property
    def client_secret(self) -> str:
        return os.environ.get(self.client_secret_env, "")

    @property
    def configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    def redirect_uri(self, public_url: str) -> str:
        return f"{public_url.rstrip('/')}/api/keel/v1/auth/{self.name}/callback"

    def authorize(self, public_url: str, state: str) -> str:
        q = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri(public_url),
            "scope": self.scope,
            "state": state,
            "response_type": "code",
        }
        if self.name == "google":
            q["prompt"] = "select_account"
        return f"{self.authorize_url}?{urlencode(q)}"


GITHUB = Provider(
    "github",
    "https://github.com/login/oauth/authorize",
    "https://github.com/login/oauth/access_token",
    "read:user user:email",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
)
GOOGLE = Provider(
    "google",
    "https://accounts.google.com/o/oauth2/v2/auth",
    "https://oauth2.googleapis.com/token",
    "openid email profile",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
)
PROVIDERS = {"github": GITHUB, "google": GOOGLE}


class OAuthError(Exception):
    pass


async def exchange(p: Provider, code: str, public_url: str, http: httpx.AsyncClient) -> Profile:
    r = await http.post(
        p.token_url,
        data={
            "client_id": p.client_id,
            "client_secret": p.client_secret,
            "code": code,
            "redirect_uri": p.redirect_uri(public_url),
            "grant_type": "authorization_code",
        },
        headers={"Accept": "application/json"},
    )
    token = r.json().get("access_token") if r.status_code == 200 else None
    if not token:
        raise OAuthError(f"{p.name} didn't accept the sign in code")
    auth = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    if p.name == "github":
        u = (await http.get("https://api.github.com/user", headers=auth)).json()
        emails = (await http.get("https://api.github.com/user/emails", headers=auth)).json()
        primary = next((e["email"] for e in emails if e.get("primary") and e.get("verified")), None)
        if not primary:
            raise OAuthError("your GitHub account has no verified primary email")
        return Profile(str(u["id"]), primary, u.get("name") or u.get("login") or "", u.get("avatar_url"))

    info = (await http.get("https://openidconnect.googleapis.com/v1/userinfo", headers=auth)).json()
    if not info.get("email_verified"):
        raise OAuthError("your Google account's email isn't verified")
    return Profile(info["sub"], info["email"], info.get("name", ""), info.get("picture"))


# ---------- state: a signed, short lived nonce kept in a cookie ----------


def _secret() -> bytes:
    s = os.environ.get("KEEL_SESSION_SECRET", "")
    if not s:
        raise OAuthError("set KEEL_SESSION_SECRET to enable sign in")
    return s.encode()


def make_state(ttl_s: int = 600) -> str:
    raw = f"{secrets.token_urlsafe(16)}.{int(time.time()) + ttl_s}"
    sig = hmac.new(_secret(), raw.encode(), hashlib.sha256).digest()
    return f"{raw}.{base64.urlsafe_b64encode(sig).decode().rstrip('=')}"


def check_state(state: str, cookie: str | None) -> bool:
    if not state or not cookie or not hmac.compare_digest(state, cookie):
        return False
    try:
        nonce, exp, sig = state.split(".")
    except ValueError:
        return False
    expect = (
        base64.urlsafe_b64encode(hmac.new(_secret(), f"{nonce}.{exp}".encode(), hashlib.sha256).digest())
        .decode()
        .rstrip("=")
    )
    return hmac.compare_digest(sig, expect) and int(exp) > time.time()
