from __future__ import annotations

import base64
import dataclasses
import hashlib
import hmac
import json
import os
import re
import time

import httpx
import pytest
from keel_api.main import create_app

from keel.accounts import plans
from keel.accounts.email import LogMailer
from keel.accounts.models import Plan
from keel.core.agent import AgentConfig
from keel.providers.base import Completion
from keel.providers.fake import FakeProvider
from keel.store.memory import MemoryStore
from keel.tools.registry import Registry
from keel.worker.loop import Outcome
from keel.worker.worker import Worker
from tests.helpers import ORG, new_run

WHSEC = "whsec_test_secret"


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv("KEEL_SESSION_SECRET", "test-session-secret-that-is-long-enough")
    monkeypatch.setenv("KEEL_MASTER_KEY", base64.b64encode(os.urandom(32)).decode())
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", WHSEC)
    monkeypatch.setenv("STRIPE_PRICE_PRO", "price_pro")
    monkeypatch.setenv("STRIPE_PRICE_TEAM", "price_team")
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    a = create_app(MemoryStore())
    a.state.keel.mailer = LogMailer()
    a.state.keel.public_url = "http://web.test"
    return a


async def signed_in(app, email: str) -> httpx.AsyncClient:
    c = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://api.test")
    await c.post("/v1/auth/email", json={"email": email})
    await c.get(re.search(r"/api/keel(\S+)", app.state.keel.mailer.sent[-1][2]).group(1))
    return c


def stripe_signed(payload: dict) -> tuple[bytes, str]:
    body = json.dumps(payload).encode()
    t = int(time.time())
    sig = hmac.new(WHSEC.encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return body, f"t={t},v1={sig}"


async def test_billing_shows_plan_limits_and_usage(app):
    c = await signed_in(app, "ana@halyard.dev")
    b = (await c.get("/v1/billing")).json()
    assert b["plan"] == "free" and b["limits"]["concurrent_runs"] == 2
    assert b["usage"]["runs"] == 0 and b["usage"]["members"] == 1
    assert b["stripe"] is False and set(b["plans"]) == {"free", "pro", "team"}
    await c.aclose()


async def test_out_of_runs_means_402(app, monkeypatch):
    monkeypatch.setitem(plans.PLANS, Plan.FREE, dataclasses.replace(plans.PLANS[Plan.FREE], runs_per_month=1))
    c = await signed_in(app, "ana@halyard.dev")
    agent = (await c.post("/v1/agents", json={"name": "a"})).json()
    first = await c.post("/v1/runs", json={"agent_id": agent["id"], "input": {"task": "one"}})
    assert first.status_code == 201
    second = await c.post("/v1/runs", json={"agent_id": agent["id"], "input": {"task": "two"}})
    assert second.status_code == 402 and "1 runs a month" in second.json()["detail"]
    await c.aclose()


async def test_stripe_webhook_sets_the_plan(app):
    c = await signed_in(app, "ana@halyard.dev")
    org_id = (await c.get("/v1/me")).json()["org"]["id"]
    accounts = app.state.keel.accounts

    body, sig = stripe_signed(
        {
            "id": "evt_1",
            "object": "event",
            "type": "checkout.session.completed",
            "data": {"object": {"client_reference_id": org_id, "customer": "cus_1", "subscription": "sub_1"}},
        }
    )
    r = await c.post("/v1/webhooks/stripe", content=body, headers={"stripe-signature": sig})
    assert r.status_code == 200 and (await accounts.get_org(org_id)).stripe_customer_id == "cus_1"

    body, sig = stripe_signed(
        {
            "id": "evt_2",
            "object": "event",
            "type": "customer.subscription.updated",
            "data": {
                "object": {
                    "id": "sub_1",
                    "customer": "cus_1",
                    "status": "active",
                    "items": {"data": [{"price": {"id": "price_pro"}}]},
                }
            },
        }
    )
    await c.post("/v1/webhooks/stripe", content=body, headers={"stripe-signature": sig})
    assert (await accounts.get_org(org_id)).plan == Plan.PRO
    assert (await c.get("/v1/billing")).json()["limits"]["concurrent_runs"] == 20

    body, sig = stripe_signed(
        {
            "id": "evt_3",
            "object": "event",
            "type": "customer.subscription.deleted",
            "data": {
                "object": {"id": "sub_1", "customer": "cus_1", "status": "canceled", "items": {"data": []}}
            },
        }
    )
    await c.post("/v1/webhooks/stripe", content=body, headers={"stripe-signature": sig})
    assert (await accounts.get_org(org_id)).plan == Plan.FREE
    await c.aclose()


async def test_forged_webhooks_are_rejected(app):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://api.test") as c:
        body = json.dumps({"type": "customer.subscription.updated"}).encode()
        r = await c.post("/v1/webhooks/stripe", content=body, headers={"stripe-signature": "t=1,v1=nope"})
    assert r.status_code == 400


async def test_checkout_needs_stripe_and_an_owner(app):
    c = await signed_in(app, "ana@halyard.dev")
    r = await c.post("/v1/billing/checkout", json={"plan": "pro"})
    assert r.status_code == 503 and "STRIPE_SECRET_KEY" in r.json()["detail"]
    assert (await c.post("/v1/billing/checkout", json={"plan": "free"})).status_code == 422
    await c.aclose()


async def test_quota_stops_a_run_at_a_step_boundary():
    store = MemoryStore()
    await new_run(store, "run_1")

    async def out_of_tokens(org_id: str) -> str | None:
        return "monthly token quota of the free plan is used up"

    provider = FakeProvider(lambda m: Completion(text="never called"))
    w = Worker("w-1", store, provider, Registry(), quota=out_of_tokens)
    out = await w.process(AgentConfig(id="agt", org_id=ORG, name="a"), "run_1")
    assert out is Outcome.LIMIT_EXCEEDED and provider.calls == 0
    last = (await store.events(ORG, "run_1"))[-1]
    assert last.payload["limit"] == "plan" and "quota" in last.payload["reason"]
