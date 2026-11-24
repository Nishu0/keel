from __future__ import annotations

import httpx
import pytest
from keel_api.main import create_app
from keel_api.rbac import Role

from keel.store.memory import MemoryStore
from keel.templates import TEMPLATES

DEV = "kl_live_dddd_template_dev"
VIEW = "kl_live_vvvv_template_view"


@pytest.fixture
def app():
    a = create_app(MemoryStore())
    a.state.keel.add_key(DEV, "org_t", Role.DEVELOPER, "key_d")
    a.state.keel.add_key(VIEW, "org_t", Role.VIEWER, "key_v")
    return a


def client(app, key: str) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://t",
        headers={"Authorization": f"Bearer {key}"},
    )


def test_templates_are_consistent():
    assert len({t.id for t in TEMPLATES}) == len(TEMPLATES)
    for t in TEMPLATES:
        assert set(t.approval_required) <= set(t.tools), t.id
        assert t.sample_task


async def test_listing_says_what_the_org_is_missing(app, monkeypatch):
    monkeypatch.delenv("KEEL_SANDBOX", raising=False)
    async with client(app, VIEW) as c:
        rows = {t["id"]: t for t in (await c.get("/v1/templates")).json()}
    assert rows["researcher"]["missing"] == []
    assert rows["analyst"]["missing"] == ["run_python"]  # no sandbox switched on


async def test_using_a_template_creates_an_agent_and_a_first_run(app):
    async with client(app, DEV) as c:
        r = await c.post("/v1/templates/researcher", json={})
        assert r.status_code == 201
        body = r.json()
        assert body["agent"]["tools"] == ["web_fetch", "current_time"]
        run = (await c.get(f"/v1/runs/{body['run_id']}")).json()
        assert run["agent_id"] == body["agent"]["id"] and run["status"] == "queued"
        assert (await c.post("/v1/templates/nope", json={})).status_code == 404

        # tools the org lacks are dropped, and approvals only cover tools it kept
        op = (await c.post("/v1/templates/operator", json={"run_sample": False})).json()
        assert (
            op["missing"] == ["run_shell"] and op["agent"]["approval_required"] == [] and op["run_id"] is None
        )


async def test_viewers_cant_create_from_templates(app):
    async with client(app, VIEW) as c:
        assert (await c.post("/v1/templates/researcher", json={})).status_code == 403
