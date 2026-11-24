from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from keel.core.agent import AgentConfig
from keel.core.events import Event, EventType
from keel.providers.base import Completion, Message, ToolCall, Usage
from keel.store.base import RunDoc
from keel.store.memory import MemoryStore
from keel.tools.registry import Registry

ORG = "org_test"


@dataclass
class Desk:
    """A fake trading desk: an external system that counts real side effects."""

    orders: dict[str, dict[str, Any]] = field(default_factory=dict)
    invocations: int = 0

    async def place(self, key: str, market: str, size: int) -> dict[str, Any]:
        self.invocations += 1
        if key in self.orders:  # the desk honours idempotency keys
            return self.orders[key]
        order = {
            "order_id": f"ord_{len(self.orders) + 1}",
            "market": market,
            "size": size,
            "status": "filled",
        }
        self.orders[key] = order
        return order


def trading_script(markets: list[str]):
    """Read a book, place one order per market, then report."""

    def script(messages: list[Message]) -> Completion:
        done = [m for m in messages if m.role == "tool"]
        i = len(done)
        if i == 0:
            return Completion(
                text="reading",
                tool_calls=[ToolCall(name="read_book", input={"market": markets[0]})],
                usage=Usage(input=100, output=10),
            )
        if i <= len(markets):
            m = markets[i - 1]
            return Completion(
                text=f"buying {m}",
                tool_calls=[ToolCall(name="place_order", input={"market": m, "size": 10})],
                usage=Usage(input=100, output=10),
            )
        return Completion(text=f"placed {len(markets)} orders", usage=Usage(input=100, output=20))

    return script


def make_registry(desk: Desk, *, reconcile: bool = True) -> Registry:
    reg = Registry()

    @reg.tool(effect="pure")
    async def read_book(market: str) -> dict[str, Any]:
        """Read the order book."""
        return {"market": market, "bid": 0.57, "ask": 0.58}

    async def order_status(idempotency_key: str) -> dict[str, Any] | None:
        return desk.orders.get(idempotency_key)

    @reg.tool(effect="external", reconcile=order_status if reconcile else None)
    async def place_order(market: str, size: int, idempotency_key: str) -> dict[str, Any]:
        """Place an order."""
        return await desk.place(idempotency_key, market, size)

    return reg


def agent(**kw: Any) -> AgentConfig:
    base = dict(id="agt_t", org_id=ORG, name="t", tools=["read_book", "place_order"])
    base.update(kw)
    return AgentConfig(**base)


async def new_run(store: MemoryStore, run_id: str, task: str = "trade") -> None:
    await store.create_run(RunDoc(id=run_id, org_id=ORG, agent_id="agt_t", input={"task": task}))
    await store.append(
        Event(
            org_id=ORG, run_id=run_id, seq=1, type=EventType.RUN_CREATED, payload={"input": {"task": task}}
        ),
        None,
    )
