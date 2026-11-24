from __future__ import annotations

import asyncio
import base64
import os
import re
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from keel_api.main import create_app

from keel.accounts.email import LogMailer
from keel.accounts.models import Org, Schedule
from keel.accounts.store import MemoryAccounts
from keel.automations import fill, fire_due, next_fire
from keel.core.agent import AgentConfig
from keel.store.memory import MemoryStore

ORG = "org_a"


def test_fill_templates():
    body = {"action": "opened", "issue": {"title": "Crash on start", "number": 42}}
    assert (
        fill("Triage #{issue.number}: {issue.title} ({action})", body)
        == "Triage #42: Crash on start (opened)"
    )
    assert fill("Keep {missing} as is", body) == "Keep {missing} as is"


def test_next_fire_is_utc_and_validated():
    assert next_fire("0 9 * * 1-5", datetime(2026, 11, 24, 8, 0, tzinfo=UTC)) == datetime(
        2026, 11, 24, 9, 0, tzinfo=UTC
    )
    with pytest.raises(ValueError, match="five fields"):
        next_fire("every morning", datetime.now(UTC))


async def test_a_due_schedule_fires_once_even_with_two_workers():
    accounts, store = MemoryAccounts(), MemoryStore()
    await accounts.create_org(Org(id=ORG, name="a"))
    await store.put_agent(AgentConfig(id="agt", org_id=ORG, name="digest"))
    due = datetime(2026, 11, 24, 9, 0, tzinfo=UTC)
    await accounts.put_schedule(
        Schedule(
            id="sch_1",
            org_id=ORG,
            agent_id="agt",
            name="daily",
            cron="0 9 * * *",
            task="Send the digest",
            next_run_at=due,
            created_by="usr",
        )
    )
    now = due + timedelta(seconds=5)
    a, b = await asyncio.gather(fire_due(accounts, store, now), fire_due(accounts, store, now))
    assert len(a) + len(b) == 1  # one claim wins
    runs = await store.list_runs(ORG)
    assert len(runs) == 1 and runs[0].input == {"task": "Send the digest"}
    s = (await accounts.list_schedules(ORG))[0]
    assert s.next_run_at == due + timedelta(days=1) and s.last_run_id == runs[0].id

    assert await fire_due(accounts, store, now + timedelta(hours=1)) == []  # not due again yet


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv("KEEL_SESSION_SECRET", "test-session-secret-that-is-long-enough")
    monkeypatch.setenv("KEEL_MASTER_KEY", base64.b64encode(os.urandom(32)).decode())
    a = create_app(MemoryStore())
    a.state.keel.mailer = LogMailer()
    a.state.keel.public_url = "http://web.test"
    return a


async def signed_in(app, email: str) -> httpx.AsyncClient:
    c = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://api.test")
    await c.post("/v1/auth/email", json={"email": email})
    await c.get(re.search(r"/api/keel(\S+)", app.state.keel.mailer.sent[-1][2]).group(1))
    return c


async def test_schedules_through_the_api(app):
    c = await signed_in(app, "ana@halyard.dev")
    agent = (await c.post("/v1/agents", json={"name": "digest"})).json()
    bad = await c.post(
        "/v1/schedules", json={"agent_id": agent["id"], "name": "x", "cron": "daily", "task": "t"}
    )
    assert bad.status_code == 422
    ok = await c.post(
        "/v1/schedules",
        json={"agent_id": agent["id"], "name": "Weekdays", "cron": "0 9 * * 1-5", "task": "Digest"},
    )
    assert ok.status_code == 201 and ok.json()["enabled"] is True
    sid = ok.json()["id"]
    assert (await c.patch(f"/v1/schedules/{sid}", json={"enabled": False})).json()["enabled"] is False
    assert (await c.delete(f"/v1/schedules/{sid}")).status_code == 204
    await c.aclose()


async def test_a_trigger_url_starts_a_run(app):
    c = await signed_in(app, "ana@halyard.dev")
    org_id = (await c.get("/v1/me")).json()["org"]["id"]
    agent = (await c.post("/v1/agents", json={"name": "triage"})).json()
    t = (
        await c.post(
            "/v1/triggers",
            json={"agent_id": agent["id"], "name": "GitHub issues", "task_template": "Triage: {issue.title}"},
        )
    ).json()
    path = re.search(r"/api/keel(/v1/hooks/\S+)", t["url"]).group(1)
    assert "url" not in (await c.get("/v1/triggers")).json()[0]  # shown once

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://api.test") as anon:
        r = await anon.post(path, json={"issue": {"title": "Crash on start"}})
        assert r.status_code == 202
        run = await app.state.keel.store.get_run(org_id, r.json()["run_id"])
        assert run.input == {"task": "Triage: Crash on start"}
        assert (await anon.post("/v1/hooks/trg_nope", json={})).status_code == 404

    await c.delete(f"/v1/triggers/{t['id']}")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://api.test") as anon:
        assert (await anon.post(path, json={})).status_code == 404
    await c.aclose()


async def test_automations_stay_in_their_org(app):
    a = await signed_in(app, "ana@halyard.dev")
    b = await signed_in(app, "bo@other.dev")
    agent = (await a.post("/v1/agents", json={"name": "digest"})).json()
    s = (
        await a.post(
            "/v1/schedules", json={"agent_id": agent["id"], "name": "x", "cron": "0 9 * * *", "task": "t"}
        )
    ).json()
    assert (await b.get("/v1/schedules")).json() == []
    assert (await b.delete(f"/v1/schedules/{s['id']}")).status_code == 404
    assert (
        await b.post("/v1/triggers", json={"agent_id": agent["id"], "name": "x", "task_template": "t"})
    ).status_code == 404
    await a.aclose()
    await b.aclose()
