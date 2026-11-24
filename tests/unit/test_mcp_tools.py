from __future__ import annotations

import base64
import os
import re

import httpx
import pytest
from keel_api.main import create_app
from keel_api.routes.tools import tools_for_org
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError as McpToolError
from mcp.types import ToolAnnotations

from keel.accounts.email import LogMailer
from keel.core.agent import AgentConfig
from keel.core.events import EventType
from keel.providers.base import Completion, ToolCall
from keel.providers.fake import FakeProvider
from keel.store.memory import MemoryStore
from keel.worker.loop import Outcome
from keel.worker.worker import Worker

# ---------- a real MCP server, in process ----------

SEEN: list[dict] = []


def make_desk() -> MCPServer:
    """A fresh server per test: the sdk's session manager starts once per instance."""
    desk = MCPServer("desk")

    @desk.tool(annotations=ToolAnnotations(read_only_hint=True))
    def get_price(market: str) -> dict:
        """Current price for a market."""
        return {"market": market, "price": 0.58}

    @desk.tool()
    def place_order(market: str, size: int) -> dict:
        """Place an order."""
        SEEN.append({"market": market, "size": size})
        return {"order_id": f"ord_{len(SEEN)}", "filled": size}

    @desk.tool()
    def always_fails(reason: str) -> str:
        """Refuses every call."""
        # the sdk hides unexpected exceptions; ToolError is how a server says why
        raise McpToolError(f"desk says no: {reason}")

    return desk


@pytest.fixture(scope="module")
def desk_url():
    """Serve the desk over real http on a free local port, the way a remote server would be."""
    import socket
    import threading
    import time

    import uvicorn

    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    server = uvicorn.Server(
        uvicorn.Config(
            make_desk().streamable_http_app(stateless_http=True, json_response=True),
            host="127.0.0.1",
            port=port,
            log_level="error",
        )
    )
    t = threading.Thread(target=server.run, daemon=True)
    t.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.02)
    yield f"http://127.0.0.1:{port}/mcp"
    server.should_exit = True
    t.join(timeout=5)


@pytest.fixture
def app(monkeypatch, desk_url):
    monkeypatch.setenv("KEEL_SESSION_SECRET", "test-session-secret-that-is-long-enough")
    monkeypatch.setenv("KEEL_MASTER_KEY", base64.b64encode(os.urandom(32)).decode())
    a = create_app(MemoryStore())
    a.state.keel.mailer = LogMailer()
    a.state.keel.public_url = "http://web.test"
    a.state.keel.desk_url = desk_url  # handy in tests
    SEEN.clear()
    return a


async def signed_in(app, email: str) -> httpx.AsyncClient:
    c = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://api.test")
    await c.post("/v1/auth/email", json={"email": email})
    await c.get(re.search(r"/api/keel(\S+)", app.state.keel.mailer.sent[-1][2]).group(1))
    return c


async def test_connecting_a_server_discovers_its_tools(app):
    c = await signed_in(app, "ana@halyard.dev")
    r = await c.post("/v1/tools/mcp", json={"server": "desk", "url": app.state.keel.desk_url})
    assert r.status_code == 201, r.text
    tools = {t["name"]: t for t in r.json()["tools"]}
    assert set(tools) == {"desk__get_price", "desk__place_order", "desk__always_fails"}
    assert tools["desk__get_price"]["effect"] == "pure"  # read only on the server
    assert tools["desk__place_order"]["effect"] == "external"  # everything else is careful by default
    assert tools["desk__place_order"]["input_schema"]["required"] == ["market", "size"]

    listed = (await c.get("/v1/tools")).json()
    assert {t["name"] for t in listed["org"]} == set(tools)
    assert "web_fetch" in {t["name"] for t in listed["builtin"]}
    await c.aclose()


async def test_an_agent_calls_mcp_tools_in_a_run(app):
    c = await signed_in(app, "ana@halyard.dev")
    org_id = (await c.get("/v1/me")).json()["org"]["id"]
    await c.post("/v1/tools/mcp", json={"server": "desk", "url": app.state.keel.desk_url})

    def script(messages):
        done = [m for m in messages if m.role == "tool"]
        if not done:
            return Completion(tool_calls=[ToolCall(name="desk__get_price", input={"market": "FED"})])
        if len(done) == 1:
            return Completion(
                tool_calls=[ToolCall(name="desk__place_order", input={"market": "FED", "size": 10})]
            )
        return Completion(text=done[-1].content)

    st = app.state.keel
    store = st.store
    await store.put_agent(
        AgentConfig(id="agt_desk", org_id=org_id, name="desk", tools=["desk__get_price", "desk__place_order"])
    )
    from keel.store.base import RunDoc

    await store.create_run(RunDoc(id="run_mcp", org_id=org_id, agent_id="agt_desk", input={"task": "buy"}))
    await store.append(
        __import__("keel.core.events", fromlist=["Event"]).Event(
            org_id=org_id,
            run_id="run_mcp",
            seq=1,
            type=EventType.RUN_CREATED,
            payload={"input": {"task": "buy"}},
        ),
        None,
    )
    worker = Worker(
        "w-1", store, FakeProvider(script), st.base_tools(), tools_for=lambda org: tools_for_org(st, org)
    )
    out = await worker.process(await store.get_agent(org_id, "agt_desk"), "run_mcp")

    assert out is Outcome.COMPLETED
    assert SEEN == [{"market": "FED", "size": 10}]  # sent exactly once
    log = await store.events(org_id, "run_mcp")
    started = [e for e in log if e.type is EventType.TOOL_STARTED]
    assert [e.payload["effect"] for e in started] == ["pure", "external"]
    assert started[1].payload["idempotency_key"].startswith("tc_")
    await c.aclose()


async def test_server_side_errors_reach_the_model(app):
    c = await signed_in(app, "ana@halyard.dev")
    r = await c.post("/v1/tools/mcp", json={"server": "desk", "url": app.state.keel.desk_url})
    fails = next(t for t in r.json()["tools"] if t["name"] == "desk__always_fails")
    out = (await c.post(f"/v1/tools/{fails['id']}/test", json={"input": {"reason": "closed"}})).json()
    assert out["ok"] is False and "desk says no: closed" in out["error"]
    price = next(t for t in r.json()["tools"] if t["name"] == "desk__get_price")
    ok = (await c.post(f"/v1/tools/{price['id']}/test", json={"input": {"market": "CPI"}})).json()
    assert ok == {"ok": True, "output": {"market": "CPI", "price": 0.58}}
    bad = await c.post(f"/v1/tools/{price['id']}/test", json={"input": {}})
    assert bad.status_code == 422  # schema from the server is enforced before calling
    await c.aclose()


async def test_effect_can_be_changed_and_tools_removed(app):
    c = await signed_in(app, "ana@halyard.dev")
    r = await c.post("/v1/tools/mcp", json={"server": "desk", "url": app.state.keel.desk_url})
    order = next(t for t in r.json()["tools"] if t["name"] == "desk__place_order")
    assert (await c.patch(f"/v1/tools/{order['id']}", json={"effect": "pure"})).json()["effect"] == "pure"
    assert (await c.delete("/v1/tools/mcp/desk")).status_code == 204
    assert (await c.get("/v1/tools")).json()["org"] == []
    await c.aclose()


async def test_webhooks_need_a_signing_secret_and_https(app):
    c = await signed_in(app, "ana@halyard.dev")
    body = {"name": "place_order", "url": "https://desk.example.com/keel", "signing_secret": "DESK_SIGNING"}
    assert (
        "add a secret named DESK_SIGNING" in (await c.post("/v1/tools/webhook", json=body)).json()["detail"]
    )
    await c.post("/v1/secrets", json={"name": "DESK_SIGNING", "value": "whsec_123"})
    assert (
        await c.post("/v1/tools/webhook", json={**body, "url": "http://desk.example.com/keel"})
    ).status_code == 422
    ok = await c.post("/v1/tools/webhook", json=body)
    assert ok.status_code == 201 and ok.json()["effect"] == "external"
    await c.aclose()


async def test_org_tools_stay_in_their_org(app):
    a = await signed_in(app, "ana@halyard.dev")
    b = await signed_in(app, "bo@other.dev")
    r = await a.post("/v1/tools/mcp", json={"server": "desk", "url": app.state.keel.desk_url})
    tid = r.json()["tools"][0]["id"]
    assert (await b.get("/v1/tools")).json()["org"] == []
    assert (await b.delete(f"/v1/tools/{tid}")).status_code == 404
    assert (await b.post(f"/v1/tools/{tid}/test", json={"input": {}})).status_code == 404
    b_org = (await b.get("/v1/me")).json()["org"]["id"]
    reg = await tools_for_org(app.state.keel, b_org)
    assert not any(n.startswith("desk__") for n in reg.names())
    await a.aclose()
    await b.aclose()
