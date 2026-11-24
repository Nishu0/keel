from __future__ import annotations

from typing import Literal

import pytest

from keel.tools.registry import Effect, Registry, ToolInputError


def test_schema_comes_from_the_signature_and_hides_the_key():
    reg = Registry()

    @reg.tool(effect="external", timeout_s=10)
    async def place_order(
        market_id: str, side: Literal["yes", "no"], size: float, idempotency_key: str
    ) -> dict:
        """Place a limit order."""
        return {}

    t = reg.get("place_order")
    assert t is not None and t.effect is Effect.EXTERNAL and t.wants_key
    schema = t.spec.input_schema
    assert set(schema["properties"]) == {"market_id", "side", "size"}
    assert schema["properties"]["side"]["enum"] == ["yes", "no"]
    assert t.spec.description == "Place a limit order."


def test_validation_rejects_bad_input():
    reg = Registry()

    @reg.tool
    async def add(a: int, b: int = 1) -> int:
        return a + b

    t = reg.get("add")
    assert t.validate({"a": "2"}) == {"a": 2, "b": 1}
    with pytest.raises(ToolInputError):
        t.validate({"b": 3})


def test_registry_guards():
    reg = Registry()

    with pytest.raises(TypeError):
        reg.tool(lambda: None)

    async def recon(key: str):
        return None

    with pytest.raises(ValueError, match="reconcile"):

        @reg.tool(effect="pure", reconcile=recon)
        async def f() -> None: ...

    @reg.tool
    async def g() -> None: ...

    with pytest.raises(ValueError, match="already"):
        reg.tool(g)
