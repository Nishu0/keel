from __future__ import annotations

import httpx
import pytest
from keel_api.main import create_app
from keel_api.rbac import Role

from keel.core.ids import call_id
from keel.core.status import RunStatus
from keel.providers.fake import FakeProvider
from keel.store.memory import MemoryStore
from keel.worker.worker import Worker
from tests.helpers import Desk, make_registry, trading_script

KEY_A = "kl_live_aaaa_secret_one"
KEY_A_VIEW = "kl_live_vvvv_secret_two"
KEY_B = "kl_live_bbbb_secret_three"


@pytest.fixture
def env():
    store = MemoryStore()
    app = create_app(store)
    st = app.state.keel
    st.add_key(KEY_A, "org_a", Role.DEVELOPER, "key_a")
    st.add_key(KEY_A_VIEW, "org_a", Role.VIEWER, "key_av")
    st.add_key(KEY_B, "org_b", Role.OWNER, "key_b")
    return app, store


def client(app, key: str | None) -> httpx.AsyncClient:
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t", headers=headers)


AGENT = {"name": "trader", "tools": ["read_book", "place_order"], "approval_required": ["place_order"]}


async def test_full_flow_with_approval(env):
    app, store = env
    async with client(app, KEY_A) as c:
        agent = (await c.post("/v1/agents", json=AGENT)).json()
        assert agent["version"] == 1 and agent["org_id"] == "org_a"

        run = (await c.post("/v1/runs", json={"agent_id": agent["id"], "input": {"task": "buy FED"}})).json()
        assert run["status"] == "queued" and run["last_seq"] == 1

        desk = Desk()
        worker = Worker("w-1", store, FakeProvider(trading_script(["FED"])), make_registry(desk))
        cfg = await store.get_agent("org_a", agent["id"])
        await worker.process(cfg, run["id"])

        r = (await c.get(f"/v1/runs/{run['id']}")).json()
        assert r["status"] == "waiting_for_approval"

        bad = await c.post(f"/v1/runs/{run['id']}/approve", json={"call_id": "tc_nope", "approve": True})
        assert bad.status_code == 404
        ok = await c.post(
            f"/v1/runs/{run['id']}/approve", json={"call_id": call_id(run["id"], 2, 0), "approve": True}
        )
        assert ok.json()["status"] == "queued"

        await worker.process(cfg, run["id"])
        r = (await c.get(f"/v1/runs/{run['id']}")).json()
        assert r["status"] == "completed" and r["output"] == "placed 1 orders"
        assert desk.invocations == 1

        events = (await c.get(f"/v1/runs/{run['id']}/events", params={"after_seq": 3})).json()
        assert events[0]["seq"] == 4
        types = [e["type"] for e in events]
        assert "approval.granted" in types and types[-1] == "run.completed"
        granted = next(e for e in events if e["type"] == "approval.granted")
        assert granted["payload"]["by"] == "key:key_a"

        listed = (await c.get("/v1/runs", params={"status": "completed"})).json()
        assert [x["id"] for x in listed] == [run["id"]]


async def test_versioning(env):
    app, _ = env
    async with client(app, KEY_A) as c:
        a = (await c.post("/v1/agents", json=AGENT)).json()
        b = (await c.post("/v1/agents", json={**AGENT, "id": a["id"], "system_prompt": "be careful"})).json()
        assert b["id"] == a["id"] and b["version"] == 2
        bad = await c.post("/v1/agents", json={**AGENT, "approval_required": ["rm_rf"]})
        assert bad.status_code == 422


async def test_cancel_a_queued_run(env):
    app, store = env
    async with client(app, KEY_A) as c:
        a = (await c.post("/v1/agents", json=AGENT)).json()
        run = (await c.post("/v1/runs", json={"agent_id": a["id"], "input": {"task": "x"}})).json()
        out = (await c.post(f"/v1/runs/{run['id']}/cancel")).json()
        assert out["status"] == RunStatus.CANCELLED
        again = await c.post(f"/v1/runs/{run['id']}/cancel")
        assert again.status_code == 409


async def test_auth_and_roles(env):
    app, _ = env
    async with client(app, None) as c:
        assert (await c.get("/v1/runs")).status_code == 401
    async with client(app, "kl_live_aaaa_wrong") as c:
        assert (await c.get("/v1/runs")).status_code == 401
    async with client(app, KEY_A_VIEW) as c:
        assert (await c.get("/v1/runs")).status_code == 200
        assert (await c.post("/v1/agents", json=AGENT)).status_code == 403
    async with client(app, None) as c:
        assert (await c.get("/healthz")).json()["status"] == "ok"


async def test_tenancy_every_run_route_is_isolated(env):
    """Org B must not be able to see or touch anything of org A's."""
    app, _ = env
    async with client(app, KEY_A) as a:
        agent = (await a.post("/v1/agents", json=AGENT)).json()
        run = (await a.post("/v1/runs", json={"agent_id": agent["id"], "input": {"task": "secret"}})).json()

    rid = run["id"]
    async with client(app, KEY_B) as b:
        assert (await b.get("/v1/runs")).json() == []
        assert (await b.get("/v1/agents")).json() == []
        for method, path, body in [
            ("GET", f"/v1/runs/{rid}", None),
            ("GET", f"/v1/runs/{rid}/events", None),
            ("GET", f"/v1/runs/{rid}/stream", None),
            ("POST", f"/v1/runs/{rid}/cancel", None),
            ("POST", f"/v1/runs/{rid}/approve", {"call_id": "x", "approve": True}),
            ("POST", f"/v1/runs/{rid}/resume", {"call_id": "x", "decision": "retry"}),
            ("GET", f"/v1/agents/{agent['id']}", None),
            ("POST", "/v1/runs", {"agent_id": agent["id"], "input": {}}),
            ("POST", "/v1/agents", {**AGENT, "id": agent["id"]}),
        ]:
            r = await b.request(method, path, json=body)
            assert r.status_code == 404, f"{method} {path} leaked: {r.status_code}"


async def test_writes_are_audited_and_admin_only(env):
    app, _ = env
    async with client(app, KEY_A) as a:
        agent = (await a.post("/v1/agents", json=AGENT)).json()
        run = (await a.post("/v1/runs", json={"agent_id": agent["id"], "input": {"task": "x"}})).json()
        await a.post(f"/v1/runs/{run['id']}/cancel")
        assert (await a.get("/v1/audit")).status_code == 403  # developers can't read it
    async with client(app, KEY_B) as b:
        assert (await b.get("/v1/audit")).json() == []  # other org sees nothing

    app.state.keel.add_key("kl_live_admn_secret_four", "org_a", Role.ADMIN, "key_admin")
    async with client(app, "kl_live_admn_secret_four") as admin:
        log = (await admin.get("/v1/audit")).json()
    assert [e["action"] for e in log] == ["run.cancelled", "run.created", "agent.created"]
    assert all(e["actor"] == "key:key_a" for e in log)


async def test_usage_rollup(env):
    app, store = env
    async with client(app, KEY_A) as c:
        agent = (await c.post("/v1/agents", json={**AGENT, "approval_required": []})).json()
        run = (await c.post("/v1/runs", json={"agent_id": agent["id"], "input": {"task": "buy"}})).json()
        cfg = await store.get_agent("org_a", agent["id"])
        await Worker("w-1", store, FakeProvider(trading_script(["FED"])), make_registry(Desk())).process(
            cfg, run["id"]
        )
        u = (await c.get("/v1/usage")).json()
    assert u["totals"]["runs"] == 1
    assert u["totals"]["input_tokens"] == 300 and u["totals"]["output_tokens"] == 40  # 3 model calls
    assert u["days"][0]["agents"][agent["id"]]["runs"] == 1


async def test_fork_through_the_api(env):
    app, store = env
    async with client(app, KEY_A) as c:
        agent = (await c.post("/v1/agents", json={**AGENT, "approval_required": []})).json()
        run = (await c.post("/v1/runs", json={"agent_id": agent["id"], "input": {"task": "buy"}})).json()
        cfg = await store.get_agent("org_a", agent["id"])
        desk = Desk()
        await Worker("w-1", store, FakeProvider(trading_script(["FED"])), make_registry(desk)).process(
            cfg, run["id"]
        )

        v2 = (
            await c.post(
                "/v1/agents",
                json={**AGENT, "id": agent["id"], "approval_required": [], "system_prompt": "v2"},
            )
        ).json()
        forked = await c.post(
            f"/v1/runs/{run['id']}/fork", json={"from_step": 2, "agent_version": v2["version"]}
        )
        assert forked.status_code == 201, forked.text
        f = forked.json()
        assert f["status"] == "queued" and f["agent_version"] == 2
        events = (await c.get(f"/v1/runs/{f['id']}/events")).json()
        assert events[0]["payload"]["forked_from"] == {"run_id": run["id"], "step": 2}
        assert max(e["step"] for e in events) == 1  # only step 1 was carried over

        provider = FakeProvider(trading_script(["FED"]))
        cfg2 = await store.get_agent("org_a", agent["id"], 2)
        await Worker("w-2", store, provider, make_registry(desk)).process(cfg2, f["id"])
        assert (await c.get(f"/v1/runs/{f['id']}")).json()["status"] == "completed"
        assert provider.calls == 2  # step 1's model call was reused, not repaid

        assert (await c.post(f"/v1/runs/{run['id']}/fork", json={"from_step": 50})).status_code == 422
    async with client(app, KEY_B) as other:
        assert (await other.post(f"/v1/runs/{run['id']}/fork", json={"from_step": 2})).status_code == 404
