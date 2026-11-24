"""The run loop.

    state = fold(events)
    while not done:
        check cancel, limits
        if no pending model response: ask the model, record it
        if no tool calls: complete
        for each tool call: execute it at most once, record it

Every effect is bracketed by events, so a worker can die at any line and the
next one knows exactly what happened and what is in doubt.
"""

from __future__ import annotations

import asyncio
import contextlib
import re
import time
from collections.abc import Awaitable, Callable
from enum import StrEnum
from typing import Any

from keel.core.agent import AgentConfig
from keel.core.events import Event, EventType
from keel.core.fold import RunState, apply, fold
from keel.core.limits import EventTooLarge, bound_payload, cap
from keel.core.status import TERMINAL_STATUSES, RunStatus
from keel.providers.base import Provider, ToolCall, ToolSpec
from keel.security.redact import Redactor
from keel.store.base import RunDoc, Store, ToolCallDoc
from keel.tools.registry import Effect, Registry, ToolInputError

# model events go back to the provider byte for byte, so they're never trimmed
UNTRIMMABLE = {EventType.MODEL_COMPLETED, EventType.MODEL_REQUESTED}


class Outcome(StrEnum):
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    LIMIT_EXCEEDED = "limit_exceeded"
    WAITING_FOR_APPROVAL = "waiting_for_approval"
    WAITING = "waiting"  # a child run is working on a handoff
    NEEDS_REVIEW = "needs_review"


class Handoff:
    """Another agent, offered to the model as a tool that takes a task."""

    def __init__(self, agent: AgentConfig) -> None:
        self.agent = agent
        self.name = f"handoff__{re.sub(r'[^a-zA-Z0-9_-]+', '_', agent.name)}"[:64]

    @property
    def spec(self) -> ToolSpec:
        about = self.agent.description or self.agent.system_prompt.split("\n")[0]
        return ToolSpec(
            name=self.name,
            description=f"Give the {self.agent.name} agent a task and get its final answer. {about}".strip(),
            input_schema={
                "type": "object",
                "properties": {
                    "task": {"type": "string", "description": "What the other agent should do, in full."}
                },
                "required": ["task"],
            },
        )


class ToolError(Exception):
    """Raise from a tool when the call definitely did not take effect.

    Anything else raised by an external tool is treated as in doubt, because
    the request may have landed before the error.
    """


class RunDriver:
    def __init__(
        self,
        *,
        store: Store,
        provider: Provider,
        registry: Registry,
        agent: AgentConfig,
        org_id: str,
        run_id: str,
        worker_id: str,
        redactor: Redactor | None = None,
        quota: Callable[[str], Awaitable[str | None]] | None = None,
        notify: Callable[[str, str, str, str], Awaitable[None]] | None = None,
    ) -> None:
        self.redactor = redactor or Redactor()
        self.quota = quota
        self.notify = notify
        self.store = store
        self.provider = provider
        self.registry = registry
        self.agent = agent
        self.org_id = org_id
        self.run_id = run_id
        self.worker_id = worker_id
        self.state = RunState()
        self.handoffs: dict[str, Handoff] = {}

    # ---------- events ----------

    async def emit(self, type: EventType, step: int | None = None, **payload: Any) -> Event:
        ev = Event(
            org_id=self.org_id,
            run_id=self.run_id,
            seq=self.state.last_seq + 1,
            type=type,
            step=self.state.step if step is None else step,
            # nothing secret is ever written to the log, and nothing too big for it either
            payload=bound_payload(self.redactor(payload), trimmable=type not in UNTRIMMABLE),
        )
        await self.store.append(ev, self.worker_id)  # raises LeaseLost / SeqConflict
        apply(self.state, ev)
        return ev

    async def _finish(self, type: EventType, status: RunStatus, outcome: Outcome, **payload: Any) -> Outcome:
        await self.emit(type, **payload)
        await self.store.set_status(self.org_id, self.run_id, status, self.worker_id)
        await self._wake_parent()
        return outcome

    async def _tell(self, kind: str, detail: str) -> None:
        if self.notify is None:
            return
        with contextlib.suppress(Exception):  # a notification must never break a run
            await self.notify(self.org_id, self.run_id, kind, detail)

    async def _wake_parent(self) -> None:
        """A finished child puts its parent back in the queue to pick up the result."""
        me = await self.store.get_run(self.org_id, self.run_id)
        if me is None or not me.parent_run_id:
            return
        parent = await self.store.get_run(self.org_id, me.parent_run_id)
        if parent is not None and parent.status == RunStatus.WAITING:
            await self.store.set_status(self.org_id, parent.id, RunStatus.QUEUED)

    # ---------- loop ----------

    async def drive(self) -> Outcome:
        events = await self.store.events(self.org_id, self.run_id)
        self.state = fold(events)
        self.handoffs = {}
        for aid in self.agent.agents:
            child = await self.store.get_agent(self.org_id, aid)
            if child is not None and child.id != self.agent.id:
                h = Handoff(child)
                self.handoffs[h.name] = h
        if self.state.done:
            return _terminal_outcome(self.state.terminal)

        if self.state.ever_started:
            await self.emit(
                EventType.RUN_RESUMED,
                worker=self.worker_id,
                from_worker=self.state.last_worker,
                reason=_resume_reason(self.state.last_type, self.state.last_by),
                replayed_events=len(events),
                reused={"model_calls": self.state.model_calls, "tool_calls": len(self.state.results)},
                in_doubt=sorted(self.state.in_doubt),
            )
        else:
            await self.emit(EventType.RUN_STARTED, worker=self.worker_id)

        started_at = time.monotonic()
        limits = self.agent.limits

        while True:
            if self.state.cancel_requested:
                return await self._finish(EventType.RUN_CANCELLED, RunStatus.CANCELLED, Outcome.CANCELLED)

            if self.state.pending is None:
                if self.state.step >= limits.max_steps:
                    return await self._limit("max_steps", limits.max_steps)
                if self.state.total_tokens >= limits.max_tokens:
                    return await self._limit("max_tokens", limits.max_tokens)
                if time.monotonic() - started_at > limits.timeout_s:
                    return await self._limit("timeout_s", limits.timeout_s)
                if self.quota and (reason := await self.quota(self.org_id)):
                    return await self._finish(
                        EventType.LIMIT_EXCEEDED,
                        RunStatus.FAILED,
                        Outcome.LIMIT_EXCEEDED,
                        limit="plan",
                        reason=reason,
                    )

                step = self.state.step + 1
                await self.emit(EventType.MODEL_REQUESTED, step=step, model=self.agent.model)
                try:
                    comp = await self.provider.complete(
                        self.state.messages,
                        self.registry.specs(self.agent.tools) + [h.spec for h in self.handoffs.values()],
                        self.agent.model,
                        self.agent.max_output_tokens,
                        system=self.agent.system_prompt,
                        effort=self.agent.effort,
                    )
                except Exception as e:  # provider adapters already retried with backoff
                    await self.emit(EventType.MODEL_FAILED, step=step, error=str(e))
                    return await self._finish(
                        EventType.RUN_FAILED, RunStatus.FAILED, Outcome.FAILED, error=str(e)
                    )

                try:
                    await self.emit(
                        EventType.MODEL_COMPLETED,
                        step=step,
                        text=comp.text,
                        tool_calls=[tc.model_dump(exclude={"id"}) for tc in comp.tool_calls],
                        usage=comp.usage.model_dump(),
                        cost_usd=comp.cost_usd,
                        model=comp.model or self.agent.model,
                        stop_reason=comp.stop_reason,
                        raw=comp.raw,
                    )
                except EventTooLarge as e:
                    # can't record it, so it can't be replayed: fail cleanly rather than retry forever
                    await self.emit(EventType.MODEL_FAILED, step=step, error=str(e))
                    return await self._finish(
                        EventType.RUN_FAILED, RunStatus.FAILED, Outcome.FAILED, error=str(e)
                    )
                if not comp.tool_calls:
                    return await self._finish(
                        EventType.RUN_COMPLETED, RunStatus.COMPLETED, Outcome.COMPLETED, output=comp.text
                    )

            pending = self.state.pending
            assert pending is not None
            for tc in list(pending.tool_calls):
                if tc.id in self.state.results:
                    continue  # already done, possibly by a previous worker
                stop = await self._call(tc)
                if stop is not None:
                    return stop

    async def _limit(self, which: str, value: int) -> Outcome:
        return await self._finish(
            EventType.LIMIT_EXCEEDED, RunStatus.FAILED, Outcome.LIMIT_EXCEEDED, limit=which, value=value
        )

    # ---------- tools ----------

    async def _call(self, tc: ToolCall) -> Outcome | None:
        cid = tc.id
        assert cid is not None
        s = self.state
        if tc.name in self.handoffs:
            return await self._handoff(tc, self.handoffs[tc.name])
        tool = self.registry.get(tc.name)

        if tool is None or tc.name not in self.agent.tools:
            await self.emit(EventType.TOOL_FAILED, call_id=cid, name=tc.name, error=f"unknown tool {tc.name}")
            return None

        if tc.name in self.agent.approval_required:
            decision = s.approvals.get(cid)
            if decision is None:
                await self.emit(
                    EventType.APPROVAL_REQUESTED,
                    call_id=cid,
                    name=tc.name,
                    effect=tool.effect.value,
                    input=tc.input,
                )
            if decision in (None, "requested"):
                await self.store.set_status(
                    self.org_id, self.run_id, RunStatus.WAITING_FOR_APPROVAL, self.worker_id
                )
                if decision is None:
                    await self._tell("approval", f"{self.agent.name} wants to call {tc.name}.")
                return Outcome.WAITING_FOR_APPROVAL
            if decision == "denied":
                await self.emit(EventType.TOOL_FAILED, call_id=cid, name=tc.name, error="denied by a person")
                return None

        try:
            args = tool.validate(tc.input)
        except ToolInputError as e:
            await self.emit(EventType.TOOL_FAILED, call_id=cid, name=tc.name, error=str(e))
            return None

        external = tool.effect is Effect.EXTERNAL
        in_doubt = cid in s.started

        if external:
            doc = await self.store.start_call(
                ToolCallDoc(id=cid, org_id=self.org_id, run_id=self.run_id, tool=tc.name, input=args)
            )
            if doc.status == "completed":
                # landed and was recorded in tool_calls, the event just never got written
                await self.emit(
                    EventType.TOOL_COMPLETED, call_id=cid, name=tc.name, output=doc.output, deduped=True
                )
                return None
            if in_doubt and cid not in s.retry_ok:
                return await self._resolve_in_doubt(tc, tool.reconcile)

        await self.emit(
            EventType.TOOL_STARTED,
            call_id=cid,
            name=tc.name,
            effect=tool.effect.value,
            input=args,
            **({"idempotency_key": cid} if external else {}),
        )
        t0 = time.monotonic()
        try:
            out = await asyncio.wait_for(tool(args, cid), timeout=tool.timeout_s)
        except ToolError as e:
            await self.emit(EventType.TOOL_FAILED, call_id=cid, name=tc.name, error=str(e))
            return None
        except Exception as e:
            if not external:
                await self.emit(
                    EventType.TOOL_FAILED, call_id=cid, name=tc.name, error=f"{type(e).__name__}: {e}"
                )
                return None
            return await self._resolve_in_doubt(tc, tool.reconcile, error=f"{type(e).__name__}: {e}")

        out = cap(out)  # before both writes, so the calls record and the log agree
        if external:
            await self.store.complete_call(self.org_id, cid, out)
        await self.emit(
            EventType.TOOL_COMPLETED,
            call_id=cid,
            name=tc.name,
            output=out,
            duration_ms=int((time.monotonic() - t0) * 1000),
        )
        return None

    async def _handoff(self, tc: ToolCall, h: Handoff) -> Outcome | None:
        """Start (or check on) a child run for this call. The child id comes from the call id,
        so a resumed parent finds the same child instead of starting another."""
        cid = tc.id
        assert cid is not None
        task = tc.input.get("task") if isinstance(tc.input, dict) else None
        if not isinstance(task, str) or not task.strip():
            await self.emit(EventType.TOOL_FAILED, call_id=cid, name=tc.name, error="a handoff needs a task")
            return None
        child_id = f"run_{cid.removeprefix('tc_')}"
        child = await self.store.get_run(self.org_id, child_id)

        if child is None:
            await self.store.create_run(
                RunDoc(
                    id=child_id,
                    org_id=self.org_id,
                    agent_id=h.agent.id,
                    input={"task": task},
                    parent_run_id=self.run_id,
                )
            )
            await self.store.append(
                Event(
                    org_id=self.org_id,
                    run_id=child_id,
                    seq=1,
                    type=EventType.RUN_CREATED,
                    payload={
                        "input": {"task": task},
                        "agent_version": h.agent.version,
                        "parent_run_id": self.run_id,
                    },
                ),
                None,
            )
            await self.emit(
                EventType.HANDOFF_STARTED,
                call_id=cid,
                name=tc.name,
                agent_id=h.agent.id,
                child_run_id=child_id,
                task=task,
            )
            child = await self.store.get_run(self.org_id, child_id)

        if child is not None and child.status in TERMINAL_STATUSES:
            final = fold(await self.store.events(self.org_id, child_id))
            await self.emit(
                EventType.HANDOFF_COMPLETED, call_id=cid, child_run_id=child_id, status=child.status.value
            )
            if child.status == RunStatus.COMPLETED:
                await self.emit(
                    EventType.TOOL_COMPLETED,
                    call_id=cid,
                    name=tc.name,
                    output=final.output,
                    child_run_id=child_id,
                )
            else:
                await self.emit(
                    EventType.TOOL_FAILED,
                    call_id=cid,
                    name=tc.name,
                    error=f"{h.agent.name} {child.status.value}",
                    child_run_id=child_id,
                )
            return None

        # the child is still going: wait without holding a worker
        await self.store.set_status(self.org_id, self.run_id, RunStatus.WAITING, self.worker_id)
        # it may have finished between our check and the status change; if so, wake now
        child = await self.store.get_run(self.org_id, child_id)
        if child is not None and child.status in TERMINAL_STATUSES:
            await self.store.set_status(self.org_id, self.run_id, RunStatus.QUEUED)
        return Outcome.WAITING

    async def _resolve_in_doubt(
        self, tc: ToolCall, reconcile: Any, error: str | None = None
    ) -> Outcome | None:
        """An external call may or may not have landed. Ask, never guess."""
        cid = tc.id
        assert cid is not None
        if reconcile is not None:
            try:
                found = await reconcile(cid)
            except Exception as e:
                found, error = None, f"reconcile failed: {e}"
            else:
                if found is not None:
                    found = cap(found)
                    await self.store.complete_call(self.org_id, cid, found)
                    await self.emit(
                        EventType.TOOL_COMPLETED, call_id=cid, name=tc.name, output=found, reconciled=True
                    )
                    return None
                if error is None:
                    # reconcile answered: it never landed, so sending it now is safe
                    self.state.retry_ok.add(cid)
                    return await self._call(tc)

        await self.emit(
            EventType.TOOL_FAILED,
            call_id=cid,
            name=tc.name,
            in_doubt=True,
            reason=error or "no reconcile hook, a person needs to decide",
        )
        await self.store.set_status(self.org_id, self.run_id, RunStatus.NEEDS_REVIEW, self.worker_id)
        await self._tell("review", f"{self.agent.name} can't tell whether {tc.name} went through.")
        return Outcome.NEEDS_REVIEW


def _terminal_outcome(t: EventType | None) -> Outcome:
    return {
        EventType.RUN_COMPLETED: Outcome.COMPLETED,
        EventType.RUN_CANCELLED: Outcome.CANCELLED,
        EventType.LIMIT_EXCEEDED: Outcome.LIMIT_EXCEEDED,
    }.get(t, Outcome.FAILED)  # type: ignore[arg-type]


def _resume_reason(last: EventType | None, by: str | None) -> str:
    """Why a run is being picked up again. A person's action leaves a "by" on the event."""
    if by is None:
        return "lease expired"  # the previous worker stopped heartbeating
    if last in (EventType.APPROVAL_GRANTED, EventType.APPROVAL_DENIED):
        return "approval"
    return "review"
