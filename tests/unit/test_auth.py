from __future__ import annotations

import base64
import os
import re
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import respx
from cryptography.exceptions import InvalidTag
from keel_api.main import create_app

from keel.accounts.email import LogMailer
from keel.accounts.models import Role
from keel.security.crypto import Sealer
from keel.store.memory import MemoryStore

PUBLIC = "http://web.test"


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("KEEL_SESSION_SECRET", "test-session-secret-that-is-long-enough")
    monkeypatch.setenv("KEEL_MASTER_KEY", base64.b64encode(os.urandom(32)).decode())
    for k in ("GITHUB", "GOOGLE"):
        monkeypatch.setenv(f"{k}_CLIENT_ID", f"{k.lower()}-id")
        monkeypatch.setenv(f"{k}_CLIENT_SECRET", f"{k.lower()}-secret")


@pytest.fixture
def app():
    a = create_app(MemoryStore())
    st = a.state.keel
    st.public_url = PUBLIC
    st.mailer = LogMailer()
    st.http = httpx.AsyncClient()  # respx intercepts it
    return a


def client(app) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://api.test")


def mock_github(user_id: int = 7, email: str = "ana@halyard.dev", name: str = "Ana Ruiz"):
    respx.post("https://github.com/login/oauth/access_token").mock(
        return_value=httpx.Response(200, json={"access_token": "gho_x"})
    )
    respx.get("https://api.github.com/user").mock(
        return_value=httpx.Response(
            200, json={"id": user_id, "login": "ana", "name": name, "avatar_url": None}
        )
    )
    respx.get("https://api.github.com/user/emails").mock(
        return_value=httpx.Response(200, json=[{"email": email, "primary": True, "verified": True}])
    )


async def sign_in_github(c: httpx.AsyncClient) -> httpx.Response:
    start = await c.get("/v1/auth/github/start")
    assert start.status_code == 303
    loc = urlparse(start.headers["location"])
    assert loc.netloc == "github.com"
    q = parse_qs(loc.query)
    assert q["redirect_uri"] == [f"{PUBLIC}/api/keel/v1/auth/github/callback"]
    return await c.get("/v1/auth/github/callback", params={"code": "abc", "state": q["state"][0]})


@respx.mock
async def test_github_sign_in_creates_user_org_and_session(app):
    mock_github()
    async with client(app) as c:
        done = await sign_in_github(c)
        assert done.status_code == 303 and done.headers["location"] == f"{PUBLIC}/app"
        assert "keel_session" in c.cookies
        me = (await c.get("/v1/me")).json()
    assert me["user"]["email"] == "ana@halyard.dev"
    assert me["role"] == "owner" and me["via"] == "session"
    assert me["orgs"][0]["plan"] == "free"


@respx.mock
async def test_state_is_checked(app):
    mock_github()
    async with client(app) as c:
        await c.get("/v1/auth/github/start")
        bad = await c.get("/v1/auth/github/callback", params={"code": "abc", "state": "forged"})
    assert bad.status_code == 303 and "/sign-in?error=" in bad.headers["location"]
    assert "keel_session" not in bad.cookies


@respx.mock
async def test_google_with_the_same_email_lands_in_the_same_account(app):
    mock_github()
    respx.post("https://oauth2.googleapis.com/token").mock(
        return_value=httpx.Response(200, json={"access_token": "g"})
    )
    respx.get("https://openidconnect.googleapis.com/v1/userinfo").mock(
        return_value=httpx.Response(
            200, json={"sub": "g-1", "email": "ana@halyard.dev", "email_verified": True}
        )
    )
    async with client(app) as c:
        await sign_in_github(c)
        first = (await c.get("/v1/me")).json()["user"]["id"]
    async with client(app) as c:
        start = await c.get("/v1/auth/google/start")
        state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
        await c.get("/v1/auth/google/callback", params={"code": "x", "state": state})
        assert (await c.get("/v1/me")).json()["user"]["id"] == first


async def test_magic_link_signs_in_once(app):
    async with client(app) as c:
        assert (await c.post("/v1/auth/email", json={"email": "sam@halyard.dev"})).json() == {
            "status": "sent"
        }
        to, _, text = app.state.keel.mailer.sent[-1]
        assert to == "sam@halyard.dev"
        path = re.search(r"/api/keel(/v1/auth/email/callback\?token=\S+)", text).group(1)
        ok = await c.get(path)
        assert ok.status_code == 303 and ok.headers["location"] == f"{PUBLIC}/app"
        assert (await c.get("/v1/me")).json()["user"]["email"] == "sam@halyard.dev"
    async with client(app) as again:
        reused = await again.get(path)
        assert "/sign-in?error=" in reused.headers["location"]


async def test_logout_ends_the_session(app):
    async with client(app) as c:
        await c.post("/v1/auth/email", json={"email": "sam@halyard.dev"})
        path = re.search(r"/api/keel(\S+)", app.state.keel.mailer.sent[-1][2]).group(1)
        await c.get(path)
        token = c.cookies["keel_session"]
        await c.post("/v1/auth/logout")
    async with client(app) as stale:
        stale.cookies.set("keel_session", token)
        assert (await stale.get("/v1/me")).status_code == 401


async def _signed_in(app, email: str) -> httpx.AsyncClient:
    c = client(app)
    await c.post("/v1/auth/email", json={"email": email})
    path = re.search(r"/api/keel(\S+)", app.state.keel.mailer.sent[-1][2]).group(1)
    await c.get(path)
    return c


async def test_api_keys_work_until_revoked(app):
    owner = await _signed_in(app, "ana@halyard.dev")
    created = (await owner.post("/v1/api-keys", json={"name": "ci", "role": "developer"})).json()
    assert created["secret"].startswith("kl_live_") and created["prefix"] == created["secret"][:12]
    listed = (await owner.get("/v1/api-keys")).json()
    assert "secret" not in listed[0] and "hash" not in listed[0]

    async with client(app) as k:
        k.headers["Authorization"] = f"Bearer {created['secret']}"
        me = (await k.get("/v1/me")).json()
        assert me["via"] == "api_key" and me["role"] == "developer"
        assert (await k.get("/v1/api-keys")).status_code == 403  # developers can't manage keys
        await owner.delete(f"/v1/api-keys/{created['id']}")
        assert (await k.get("/v1/me")).status_code == 401
    await owner.aclose()


async def test_invites_need_the_invited_address(app):
    owner = await _signed_in(app, "ana@halyard.dev")
    org_id = (await owner.get("/v1/me")).json()["org"]["id"]
    invite = {"email": "ira@halyard.dev", "role": "admin"}
    assert (await owner.post("/v1/members/invite", json=invite)).status_code == 402  # free plan: one seat
    await app.state.keel.accounts.update_org(org_id, plan="pro")
    assert (await owner.post("/v1/members/invite", json=invite)).status_code == 201
    token = re.search(r"/invites/([^/]+)/accept", app.state.keel.mailer.sent[-1][2]).group(1)

    intruder = await _signed_in(app, "eve@elsewhere.dev")
    assert (await intruder.get(f"/v1/invites/{token}/accept")).status_code == 403

    ira = await _signed_in(app, "ira@halyard.dev")
    joined = await ira.get(f"/v1/invites/{token}/accept")
    assert joined.status_code == 303
    me = (await ira.get("/v1/me")).json()
    assert me["org"]["id"] == org_id and me["role"] == "admin"
    assert {m["email"] for m in (await owner.get("/v1/members")).json()["members"]} == {
        "ana@halyard.dev",
        "ira@halyard.dev",
    }
    for c in (owner, intruder, ira):
        await c.aclose()


async def test_secrets_are_sealed_and_write_only(app):
    owner = await _signed_in(app, "ana@halyard.dev")
    org_id = (await owner.get("/v1/me")).json()["org"]["id"]
    r = await owner.post("/v1/secrets", json={"name": "anthropic api key", "value": "sk-ant-real-value"})
    assert r.json()["name"] == "ANTHROPIC_API_KEY"
    listed = (await owner.get("/v1/secrets")).json()
    assert (
        listed[0]["name"] == "ANTHROPIC_API_KEY"
        and "value" not in listed[0]
        and "ciphertext" not in listed[0]
    )

    stored = await app.state.keel.accounts.get_secret(org_id, "ANTHROPIC_API_KEY")
    assert "sk-ant" not in stored.ciphertext
    sealer = app.state.keel.sealer
    assert sealer.open(org_id, "ANTHROPIC_API_KEY", stored.ciphertext, stored.nonce) == "sk-ant-real-value"
    with pytest.raises(InvalidTag):
        sealer.open("org_other", "ANTHROPIC_API_KEY", stored.ciphertext, stored.nonce)
    await owner.aclose()


async def test_orgs_cannot_see_each_others_people_or_keys(app):
    a = await _signed_in(app, "ana@halyard.dev")
    b = await _signed_in(app, "bo@other.dev")
    await a.post("/v1/api-keys", json={"name": "a-key"})
    assert [m["email"] for m in (await b.get("/v1/members")).json()["members"]] == ["bo@other.dev"]
    assert (await b.get("/v1/api-keys")).json() == []
    assert (await b.get("/v1/secrets")).json() == []
    assert (
        await b.post("/v1/me/org", json={"org_id": (await a.get("/v1/me")).json()["org"]["id"]})
    ).status_code == 403
    await a.aclose()
    await b.aclose()


def test_sealer_rejects_short_keys():
    with pytest.raises(ValueError):
        Sealer(b"short")


def test_roles_are_shared():
    from keel_api.rbac import Role as R

    assert R is Role
