from __future__ import annotations

import asyncio
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from keel.core.events import TERMINAL, Event, EventType
from keel.core.fold import fold
from keel.core.ids import new_id
from keel.core.status import TERMINAL_STATUSES, RunStatus
from keel.ratelimit import RUN_CREATE_ORG
from keel.store.base import RunDoc, SeqConflict, Store

from ..deps import Caller, Developer, Operator, State, Viewer, audit

router = APIRouter(prefix="/v1/runs", tags=["runs"])


class RunIn(BaseModel):
    agent_id: str
    input: dict[str, Any]


class RunOut(BaseModel):
    id: str
    agent_id: str
    status: RunStatus
    input: dict[str, Any]
    last_seq: int
    parent_run_id: str | None = None
    agent_version: int | None = None

    @classmethod
    def of(cls, r: RunDoc) -> RunOut:
        return cls(
            id=r.id,
            agent_id=r.agent_id,
            status=r.status,
            input=r.input,
            last_seq=r.last_seq,
            parent_run_id=r.parent_run_id,
            agent_version=r.agent_version,
        )


async def _get(store: Store, c: Caller, run_id: str) -> RunDoc:
    run = await store.get_run(c.org_id, run_id)
    if run is None:  # also what another org's run looks like
        raise HTTPException(status.HTTP_404_NOT_FOUND, "run not found")
    return run


async def _append(
    store: Store, c: Caller, run_id: str, type: EventType, step: int = 0, **payload: Any
) -> Event:
    """Append from the api (no lease). Retries once if a worker wrote in between."""
    for _ in range(3):
        log = await store.events(c.org_id, run_id)
        ev = Event(
            org_id=c.org_id,
            run_id=run_id,
            seq=len(log) + 1,
            type=type,
            step=step,
            payload={**payload, "by": c.actor},
        )
        try:
            await store.append(ev, None)
            return ev
        except SeqConflict:
            await asyncio.sleep(0.01)
    raise HTTPException(status.HTTP_409_CONFLICT, "run is busy, try again")


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_run(body: RunIn, c: Developer, st: State) -> RunOut:
    await st.limiter.hit(RUN_CREATE_ORG, c.org_id)
    agent = await st.store.get_agent(c.org_id, body.agent_id)
    if agent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "agent not found")
    from .billing import quota_problem

    if problem := await quota_problem(st, c):
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, problem)
    run = RunDoc(
        id=new_id("run"),
        org_id=c.org_id,
        agent_id=body.agent_id,
        input=body.input,
        agent_version=agent.version,
    )
    await st.store.create_run(run)
    await _append(st.store, c, run.id, EventType.RUN_CREATED, input=body.input, agent_version=agent.version)
    await audit(st, c, "run.created", run.id, agent_id=agent.id, agent_version=agent.version)
    return RunOut.of(await _get(st.store, c, run.id))


@router.get("")
async def list_runs(
    c: Viewer,
    st: State,
    status_: Annotated[RunStatus | None, Query(alias="status")] = None,
    agent_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[dict[str, Any]]:
    runs = await st.store.list_runs(c.org_id, status=status_, agent_id=agent_id, limit=limit)
    return [await _summary(st.store, c, r) for r in runs]


async def _summary(store: Store, c: Caller, run: RunDoc) -> dict[str, Any]:
    # folded from the log for now; the mongo store will keep this as a cached snapshot on the run
    s = fold(await store.events(c.org_id, run.id))
    return {
        **RunOut.of(run).model_dump(),
        "steps": s.step,
        "output": s.output,
        "in_doubt": sorted(s.in_doubt),
        "usage": {
            "input_tokens": s.input_tokens,
            "output_tokens": s.output_tokens,
            "cost_usd": round(s.cost_usd, 6),
        },
    }


@router.get("/{run_id}")
async def get_run(run_id: str, c: Viewer, st: State) -> dict[str, Any]:
    return await _summary(st.store, c, await _get(st.store, c, run_id))


@router.get("/{run_id}/events")
async def get_events(
    run_id: str, c: Viewer, st: State, after_seq: Annotated[int, Query(ge=0)] = 0, limit: int = 500
) -> list[Event]:
    await _get(st.store, c, run_id)
    return (await st.store.events(c.org_id, run_id, after_seq))[:limit]


@router.get("/{run_id}/stream")
async def stream(
    run_id: str,
    request: Request,
    c: Viewer,
    st: State,
    last_event_id: Annotated[str | None, Header()] = None,
) -> StreamingResponse:
    """Server sent events. Reconnects resume from Last-Event-ID, so nothing is missed.

    Backed by polling here; the mongo store swaps this for a change stream.
    """
    await _get(st.store, c, run_id)
    after = int(last_event_id) if last_event_id and last_event_id.isdigit() else 0

    async def gen():
        nonlocal after
        while not await request.is_disconnected():
            for e in await st.store.events(c.org_id, run_id, after):
                after = e.seq
                yield f"id: {e.seq}\nevent: {e.type.value}\ndata: {e.model_dump_json()}\n\n"
                if e.type in TERMINAL:
                    return
            yield ": keepalive\n\n"
            await asyncio.sleep(0.5)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@router.post("/{run_id}/cancel")
async def cancel(run_id: str, c: Operator, st: State) -> RunOut:
    run = await _get(st.store, c, run_id)
    if run.status in TERMINAL_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, f"run is already {run.status}")
    if run.status == RunStatus.RUNNING:
        # the worker checks between steps and ends the run itself
        await _append(st.store, c, run_id, EventType.RUN_CANCEL_REQUESTED)
    else:
        # no worker holds it, so end it here
        await _append(st.store, c, run_id, EventType.RUN_CANCELLED)
        await st.store.set_status(c.org_id, run_id, RunStatus.CANCELLED)
    await audit(st, c, "run.cancelled", run_id)
    return RunOut.of(await _get(st.store, c, run_id))


class ApproveIn(BaseModel):
    call_id: str
    approve: bool


@router.post("/{run_id}/approve")
async def approve(run_id: str, body: ApproveIn, c: Operator, st: State) -> RunOut:
    run = await _get(st.store, c, run_id)
    if run.status != RunStatus.WAITING_FOR_APPROVAL:
        raise HTTPException(status.HTTP_409_CONFLICT, "run is not waiting for approval")
    s = fold(await st.store.events(c.org_id, run_id))
    if s.approvals.get(body.call_id) != "requested":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no pending approval for that call")
    etype = EventType.APPROVAL_GRANTED if body.approve else EventType.APPROVAL_DENIED
    await _append(st.store, c, run_id, etype, step=s.step, call_id=body.call_id)
    await audit(st, c, etype.value, run_id, call_id=body.call_id)
    await st.store.set_status(c.org_id, run_id, RunStatus.QUEUED)
    return RunOut.of(await _get(st.store, c, run_id))


class ResumeIn(BaseModel):
    call_id: str
    decision: Literal["landed", "retry", "fail"]
    output: Any = None  # what the tool did, when decision is "landed"


@router.post("/{run_id}/resume")
async def resume(run_id: str, body: ResumeIn, c: Operator, st: State) -> RunOut:
    """Settle an in doubt external call that keel refused to guess about."""
    run = await _get(st.store, c, run_id)
    if run.status != RunStatus.NEEDS_REVIEW:
        raise HTTPException(status.HTTP_409_CONFLICT, "run does not need review")
    s = fold(await st.store.events(c.org_id, run_id))
    if body.call_id not in s.in_doubt:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "that call is not in doubt")
    name = next((tc.name for m in s.messages for tc in m.tool_calls if tc.id == body.call_id), None)
    await audit(st, c, f"review.{body.decision}", run_id, call_id=body.call_id, tool=name)

    if body.decision == "fail":
        await _append(st.store, c, run_id, EventType.RUN_FAILED, step=s.step, reason="failed in review")
        await st.store.set_status(c.org_id, run_id, RunStatus.FAILED)
    else:
        if body.decision == "landed":
            await _append(
                st.store,
                c,
                run_id,
                EventType.TOOL_COMPLETED,
                step=s.step,
                call_id=body.call_id,
                name=name,
                output=body.output,
                manual=True,
            )
        else:
            await _append(
                st.store, c, run_id, EventType.APPROVAL_GRANTED, step=s.step, call_id=body.call_id, retry=True
            )
        await st.store.set_status(c.org_id, run_id, RunStatus.QUEUED)
    return RunOut.of(await _get(st.store, c, run_id))


class ForkIn(BaseModel):
    from_step: int
    agent_version: int | None = None  # continue with another version of the agent
    tool_outputs: dict[str, Any] | None = None  # call_id -> replacement output, before from_step


@router.post("/{run_id}/fork", status_code=status.HTTP_201_CREATED)
async def fork(run_id: str, body: ForkIn, c: Developer, st: State) -> RunOut:
    """A new run that reuses everything before `from_step` and continues from there."""
    from keel.core.fork import ForkError, fork_events

    from .billing import quota_problem

    src = await _get(st.store, c, run_id)
    if (
        body.agent_version is not None
        and await st.store.get_agent(c.org_id, src.agent_id, body.agent_version) is None
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no version {body.agent_version} of this agent")
    if problem := await quota_problem(st, c):
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, problem)
    new = new_id("run")
    try:
        events = fork_events(
            await st.store.events(c.org_id, run_id),
            new,
            body.from_step,
            tool_outputs=body.tool_outputs,
            agent_version=body.agent_version,
        )
    except ForkError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    version = body.agent_version or src.agent_version
    await st.store.create_run(
        RunDoc(id=new, org_id=c.org_id, agent_id=src.agent_id, input=src.input, agent_version=version)
    )
    for e in events:
        await st.store.append(e, None)
    await audit(st, c, "run.forked", new, source=run_id, from_step=body.from_step)
    return RunOut.of(await _get(st.store, c, new))
