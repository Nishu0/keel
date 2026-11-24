"""Rebuild a run's state by folding its event log.

Workers never keep state between steps. On start and on resume they read the
log and fold it, so any worker can pick up any run.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from keel.core.events import Event, EventType
from keel.core.ids import call_id
from keel.providers.base import Completion, Message, ToolCall


@dataclass
class RunState:
    run_id: str = ""
    org_id: str = ""
    input: dict[str, Any] = field(default_factory=dict)
    messages: list[Message] = field(default_factory=list)
    step: int = 0
    last_seq: int = 0

    # the model response for the current step, while its tool calls are unfinished
    pending: Completion | None = None
    # step whose model call was requested but never completed (crash mid call)
    requested_step: int | None = None

    results: dict[str, Any] = field(default_factory=dict)  # call_id -> output
    started: set[str] = field(default_factory=set)  # tool.started seen
    in_doubt_reported: set[str] = field(default_factory=set)  # tool.failed {in_doubt}
    approvals: dict[str, str] = field(default_factory=dict)  # call_id -> requested|granted|denied
    retry_ok: set[str] = field(default_factory=set)  # in doubt calls a person cleared to send again

    ever_started: bool = False
    last_worker: str | None = None
    last_type: EventType | None = None  # type of the most recent event
    last_by: str | None = None  # who wrote it, when a person did (api actions carry "by")

    cancel_requested: bool = False
    done: bool = False
    terminal: EventType | None = None
    output: str | None = None

    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    model_calls: int = 0
    resumes: int = 0

    @property
    def in_doubt(self) -> set[str]:
        """Calls that started but have no recorded outcome."""
        return self.started - self.results.keys()

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


def fold(events: list[Event]) -> RunState:
    s = RunState()
    for e in sorted(events, key=lambda x: x.seq):
        apply(s, e)
    return s


def apply(s: RunState, e: Event) -> None:
    if e.seq != s.last_seq + 1:
        raise ValueError(f"gap in event log for {e.run_id}: expected seq {s.last_seq + 1}, got {e.seq}")
    s.last_seq = e.seq
    s.last_type = e.type
    p = e.payload
    s.last_by = p.get("by") if isinstance(p.get("by"), str) else None

    match e.type:
        case EventType.RUN_CREATED:
            s.run_id, s.org_id = e.run_id, e.org_id
            s.input = p.get("input", {})
            task = s.input.get("task") if isinstance(s.input, dict) else None
            s.messages.append(Message(role="user", content=task if isinstance(task, str) else str(s.input)))

        case EventType.RUN_STARTED:
            s.ever_started = True
            s.last_worker = p.get("worker")

        case EventType.RUN_RESUMED:
            s.resumes += 1
            s.last_worker = p.get("worker")

        case EventType.MODEL_REQUESTED:
            s.requested_step = e.step

        case EventType.MODEL_COMPLETED:
            comp = Completion.model_validate({k: v for k, v in p.items() if k in Completion.model_fields})
            comp.tool_calls = [
                ToolCall(
                    name=tc.name, input=tc.input, id=call_id(e.run_id, e.step, i), provider_id=tc.provider_id
                )
                for i, tc in enumerate(comp.tool_calls)
            ]
            s.messages.append(
                Message(role="assistant", content=comp.text, tool_calls=comp.tool_calls, raw=comp.raw)
            )
            s.step = e.step
            s.requested_step = None
            s.pending = comp if comp.tool_calls else None
            s.model_calls += 1
            s.input_tokens += comp.usage.input
            s.output_tokens += comp.usage.output
            s.cost_usd += comp.cost_usd
            if not comp.tool_calls:
                s.output = comp.text

        case EventType.TOOL_STARTED:
            s.started.add(p["call_id"])

        case EventType.TOOL_COMPLETED:
            _record(s, p["call_id"], p.get("output"), p.get("name"))

        case EventType.TOOL_FAILED:
            cid = p["call_id"]
            if p.get("in_doubt"):
                s.in_doubt_reported.add(cid)
            else:
                _record(s, cid, {"error": p.get("error", "tool failed")}, p.get("name"), is_error=True)

        case EventType.APPROVAL_REQUESTED:
            s.approvals[p["call_id"]] = "requested"
        case EventType.APPROVAL_GRANTED:
            s.approvals[p["call_id"]] = "granted"
            if p.get("retry"):
                # a person checked and says the in doubt call never landed
                s.retry_ok.add(p["call_id"])
                s.in_doubt_reported.discard(p["call_id"])
        case EventType.APPROVAL_DENIED:
            s.approvals[p["call_id"]] = "denied"

        case EventType.RUN_CANCEL_REQUESTED:
            s.cancel_requested = True

        case (
            EventType.RUN_COMPLETED
            | EventType.RUN_FAILED
            | EventType.RUN_CANCELLED
            | EventType.LIMIT_EXCEEDED
        ):
            s.done = True
            s.terminal = e.type
            if e.type == EventType.RUN_COMPLETED:
                s.output = p.get("output", s.output)

        case _:
            pass


def _record(s: RunState, cid: str, output: Any, name: str | None, is_error: bool = False) -> None:
    s.results[cid] = output
    s.messages.append(
        Message(role="tool", content=_stringify(output), tool_call_id=cid, name=name, is_error=is_error)
    )
    if s.pending and all(tc.id in s.results for tc in s.pending.tool_calls):
        s.pending = None


def _stringify(v: Any) -> str:
    if isinstance(v, str):
        return v
    return json.dumps(v, default=str, separators=(",", ":"))
