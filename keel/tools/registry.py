"""Tool registry.

Every tool declares an effect level. The level decides what the worker does
when it finds a call that started but never recorded an outcome:

- ``pure``: no side effects, rerun it.
- ``sandboxed``: runs in a throwaway container, rerun it.
- ``external``: touches the real world. Reconcile if possible, otherwise stop
  and ask a person. Never rerun blind.
"""

from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, get_type_hints

from jsonschema import Draft202012Validator
from pydantic import BaseModel, ValidationError, create_model

from keel.providers.base import ToolSpec


class Effect(StrEnum):
    PURE = "pure"
    SANDBOXED = "sandboxed"
    EXTERNAL = "external"


ToolFn = Callable[..., Awaitable[Any]]
ReconcileFn = Callable[[str], Awaitable[Any | None]]

# parameters keel fills in itself; never part of the model facing schema
INJECTED = {"idempotency_key"}


class ToolInputError(Exception):
    pass


@dataclass
class Tool:
    name: str
    fn: ToolFn
    effect: Effect
    description: str
    input_model: type[BaseModel] | None = None
    timeout_s: float = 30.0
    reconcile: ReconcileFn | None = None
    wants_key: bool = False
    json_schema: dict[str, Any] | None = None  # remote tools declare a schema instead of a signature

    @property
    def spec(self) -> ToolSpec:
        if self.json_schema is not None:
            schema = dict(self.json_schema)
        else:
            assert self.input_model is not None
            schema = self.input_model.model_json_schema()
        schema.pop("title", None)
        return ToolSpec(name=self.name, description=self.description, input_schema=schema)

    def validate(self, raw: dict[str, Any]) -> dict[str, Any]:
        if self.json_schema is not None:
            errors = sorted(
                Draft202012Validator(self.json_schema).iter_errors(raw), key=lambda e: list(e.path)
            )
            if errors:
                msgs = "; ".join(f"{'/'.join(map(str, e.path)) or '(root)'}: {e.message}" for e in errors[:5])
                raise ToolInputError(f"invalid input for {self.name}: {msgs}")
            return raw
        assert self.input_model is not None
        try:
            return self.input_model.model_validate(raw).model_dump()
        except ValidationError as e:
            raise ToolInputError(f"invalid input for {self.name}: {e.errors(include_url=False)}") from e

    async def __call__(self, args: dict[str, Any], idempotency_key: str) -> Any:
        if self.wants_key:
            return await self.fn(**args, idempotency_key=idempotency_key)
        return await self.fn(**args)


def _input_model(fn: ToolFn) -> type[BaseModel]:
    hints = get_type_hints(fn)
    fields: dict[str, Any] = {}
    for name, param in inspect.signature(fn).parameters.items():
        if name in INJECTED:
            continue
        ann = hints.get(name, Any)
        default = ... if param.default is inspect.Parameter.empty else param.default
        fields[name] = (ann, default)
    return create_model(f"{fn.__name__}_input", **fields)


class Registry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def tool(
        self,
        fn: ToolFn | None = None,
        *,
        effect: Effect | str = Effect.PURE,
        name: str | None = None,
        timeout_s: float = 30.0,
        reconcile: ReconcileFn | None = None,
    ) -> Any:
        """Register an async function as a tool. Usable bare or with arguments."""

        def wrap(f: ToolFn) -> ToolFn:
            if not inspect.iscoroutinefunction(f):
                raise TypeError(f"tool {f.__name__} must be async")
            eff = Effect(effect)
            if reconcile is not None and eff is not Effect.EXTERNAL:
                raise ValueError("reconcile only makes sense for external tools")
            t = Tool(
                name=name or f.__name__,
                fn=f,
                effect=eff,
                description=inspect.getdoc(f) or "",
                input_model=_input_model(f),
                timeout_s=timeout_s,
                reconcile=reconcile,
                wants_key="idempotency_key" in inspect.signature(f).parameters,
            )
            if t.name in self._tools:
                raise ValueError(f"tool {t.name} is already registered")
            self._tools[t.name] = t
            return f

        return wrap(fn) if fn is not None else wrap

    def add(self, tool: Tool) -> Tool:
        if tool.name in self._tools:
            raise ValueError(f"tool {tool.name} is already registered")
        if tool.reconcile is not None and tool.effect is not Effect.EXTERNAL:
            raise ValueError("reconcile only makes sense for external tools")
        self._tools[tool.name] = tool
        return tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def specs(self, allowed: list[str] | None = None) -> list[ToolSpec]:
        return [t.spec for n, t in self._tools.items() if allowed is None or n in allowed]

    def __contains__(self, name: str) -> bool:
        return name in self._tools

    def __len__(self) -> int:
        return len(self._tools)
