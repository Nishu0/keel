"""Fork a run from step N.

The new run starts with a copy of everything the old one recorded before step N,
so those steps are never redone or repaid: model answers and tool results are
reused as they are. From step N on, the new run continues on its own, optionally
with a different agent version or with some recorded tool results swapped out.

Call ids derive from the run id, so copied events are re-keyed to the new run.
External calls after the fork point get fresh ids and really happen again;
that is the point of a fork. Calls before it are never resent.
"""

from __future__ import annotations

from typing import Any

from keel.core.events import Event, EventType
from keel.core.ids import call_id

# events that describe the old run's life rather than its work; not copied
SKIP = {
    EventType.RUN_STARTED,
    EventType.RUN_RESUMED,
    EventType.RUN_COMPLETED,
    EventType.RUN_FAILED,
    EventType.RUN_CANCELLED,
    EventType.RUN_CANCEL_REQUESTED,
    EventType.LIMIT_EXCEEDED,
}


class ForkError(ValueError):
    pass


def fork_events(
    source: list[Event],
    new_run_id: str,
    from_step: int,
    *,
    tool_outputs: dict[str, Any] | None = None,
    agent_version: int | None = None,
) -> list[Event]:
    """The opening events of the fork. ``tool_outputs`` maps old call ids to replacement
    outputs, for "what if the tool had said this instead"."""
    if not source or source[0].type is not EventType.RUN_CREATED:
        raise ForkError("the source run has no events")
    last_step = max((e.step for e in source), default=0)
    if from_step < 1 or from_step > last_step + 1:
        raise ForkError(f"pick a step between 1 and {last_step + 1}")

    # old call id -> new call id, from each model.completed's tool calls
    remap: dict[str, str] = {}
    for e in source:
        if e.type is EventType.MODEL_COMPLETED and e.step < from_step:
            for i, _ in enumerate(e.payload.get("tool_calls") or []):
                remap[call_id(e.run_id, e.step, i)] = call_id(new_run_id, e.step, i)
    swaps = dict(tool_outputs or {})
    unknown = set(swaps) - set(remap)
    if unknown:
        raise ForkError(f"no tool call {sorted(unknown)[0]} before step {from_step}")

    out: list[Event] = []
    for e in source:
        if e.step >= from_step or e.type in SKIP:
            continue
        p = dict(e.payload)
        if e.type is EventType.RUN_CREATED:
            p["forked_from"] = {"run_id": e.run_id, "step": from_step}
            if agent_version is not None:
                p["agent_version"] = agent_version
        old = p.get("call_id")
        if isinstance(old, str) and old in remap:
            p["call_id"] = remap[old]
            if p.get("idempotency_key") == old:
                p["idempotency_key"] = remap[old]
            if e.type is EventType.TOOL_COMPLETED and old in swaps:
                p["output"] = swaps[old]
                p["swapped"] = True
        out.append(
            Event(
                org_id=e.org_id,
                run_id=new_run_id,
                seq=len(out) + 1,
                type=e.type,
                step=e.step,
                payload=p,
                ts=e.ts,
            )
        )

    # a call that started before the fork point but never finished would read as in doubt;
    # the fork starts clean, so drop those starts and let the step run them again
    done = {
        e.payload.get("call_id") for e in out if e.type in (EventType.TOOL_COMPLETED, EventType.TOOL_FAILED)
    }
    out = [e for e in out if not (e.type is EventType.TOOL_STARTED and e.payload.get("call_id") not in done)]
    return [e.model_copy(update={"seq": i + 1}) for i, e in enumerate(out)]
