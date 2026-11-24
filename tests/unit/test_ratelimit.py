from __future__ import annotations

import httpx
import pytest
from keel_api.main import create_app

from keel.accounts.email import LogMailer
from keel.ratelimit import Limit, MemoryLimiter, TooMany
from keel.store.memory import MemoryStore


async def test_fixed_window_resets():
    now = [1000.0]
    lim = MemoryLimiter(clock=lambda: now[0])
    rule = Limit("t", 2, 60)
    await lim.hit(rule, "k")
    await lim.hit(rule, "k")
    with pytest.raises(TooMany) as e:
        await lim.hit(rule, "k")
    assert 1 <= e.value.retry_after <= 60
    await lim.hit(rule, "other")  # keys are separate
    now[0] += 60
    await lim.hit(rule, "k")  # new window


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv("KEEL_SESSION_SECRET", "test-session-secret-that-is-long-enough")
    a = create_app(MemoryStore())
    a.state.keel.mailer = LogMailer()
    return a


def client(app, **headers) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://api.test", headers=headers
    )


async def test_magic_links_to_one_address_are_capped(app):
    async with client(app) as c:
        for _ in range(5):
            assert (await c.post("/v1/auth/email", json={"email": "ana@halyard.dev"})).status_code == 200
        r = await c.post("/v1/auth/email", json={"email": "Ana@halyard.dev"})  # case doesn't dodge it
        assert r.status_code == 429 and int(r.headers["retry-after"]) > 0
        assert len(app.state.keel.mailer.sent) == 5


async def test_forwarded_for_is_only_trusted_when_configured(app, monkeypatch):
    # ten links per minute per ip; spoofing x-forwarded-for must not reset it
    async with client(app) as c:
        codes = [
            (
                await c.post(
                    "/v1/auth/email", json={"email": f"u{i}@x.dev"}, headers={"x-forwarded-for": f"9.9.9.{i}"}
                )
            ).status_code
            for i in range(11)
        ]
    assert codes[-1] == 429
    monkeypatch.setenv("KEEL_TRUST_FORWARDED", "1")
    async with client(app) as c:
        r = await c.post(
            "/v1/auth/email", json={"email": "z@x.dev"}, headers={"x-forwarded-for": "8.8.4.4, 10.0.0.1"}
        )
        assert r.status_code == 200  # a different visitor behind our proxy
