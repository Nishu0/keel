from __future__ import annotations

import pytest

from keel.core.events import Event, EventType
from keel.core.fold import fold
from keel.core.ids import call_id, new_id
from keel.core.status import InvalidTransition, RunStatus, transition

R = "run_1"


def ev(seq: int, type: EventType, step: int = 0, **payload) -> Event:
    return Event(org_id="org", run_id=R, seq=seq, type=type, step=step, payload=payload)


def test_call_id_is_stable_and_distinct():
    assert call_id("run_a", 3, 0) == call_id("run_a", 3, 0)
    assert (
        len({call_id("run_a", 3, 0), call_id("run_a", 3, 1), call_id("run_a", 4, 0), call_id("run_b", 3, 0)})
        == 4
    )
    assert call_id("run_a", 1, 0).startswith("tc_")


def test_new_id_sorts_by_time():
    a, b = new_id("run"), new_id("run")
    assert a.startswith("run_") and len(a) == 30
    assert a[:14] <= b[:14]


def test_transitions():
    assert transition(RunStatus.QUEUED, RunStatus.RUNNING) is RunStatus.RUNNING
    assert transition(RunStatus.RUNNING, RunStatus.QUEUED) is RunStatus.QUEUED  # lease expired
    assert transition(RunStatus.NEEDS_REVIEW, RunStatus.QUEUED) is RunStatus.QUEUED
    with pytest.raises(InvalidTransition):
        transition(RunStatus.COMPLETED, RunStatus.RUNNING)
    with pytest.raises(InvalidTransition):
        transition(RunStatus.WAITING_FOR_APPROVAL, RunStatus.RUNNING)


def test_fold_rebuilds_conversation_and_results():
    cid = call_id(R, 1, 0)
    s = fold(
        [
            ev(1, EventType.RUN_CREATED, input={"task": "rebalance"}),
            ev(2, EventType.RUN_STARTED, worker="w-1"),
            ev(3, EventType.MODEL_REQUESTED, 1),
            ev(
                4,
                EventType.MODEL_COMPLETED,
                1,
                text="reading",
                tool_calls=[{"name": "read_book", "input": {"m": "X"}}],
                usage={"input": 50, "output": 5},
                cost_usd=0.01,
            ),
            ev(5, EventType.TOOL_STARTED, 1, call_id=cid, name="read_book"),
            ev(6, EventType.TOOL_COMPLETED, 1, call_id=cid, name="read_book", output={"bid": 1}),
        ]
    )
    assert [m.role for m in s.messages] == ["user", "assistant", "tool"]
    assert s.messages[1].tool_calls[0].id == cid
    assert s.results == {cid: {"bid": 1}}
    assert s.pending is None and s.step == 1 and s.ever_started
    assert s.total_tokens == 55 and s.cost_usd == pytest.approx(0.01)
    assert not s.in_doubt


def test_fold_marks_started_without_outcome_as_in_doubt():
    cid = call_id(R, 1, 0)
    s = fold(
        [
            ev(1, EventType.RUN_CREATED, input={"task": "t"}),
            ev(2, EventType.MODEL_REQUESTED, 1),
            ev(3, EventType.MODEL_COMPLETED, 1, text="", tool_calls=[{"name": "place_order", "input": {}}]),
            ev(4, EventType.TOOL_STARTED, 1, call_id=cid, name="place_order"),
        ]
    )
    assert s.in_doubt == {cid}
    assert s.pending is not None


def test_fold_remembers_a_model_call_that_never_finished():
    s = fold([ev(1, EventType.RUN_CREATED, input={"task": "t"}), ev(2, EventType.MODEL_REQUESTED, 1)])
    assert s.requested_step == 1 and s.model_calls == 0


def test_fold_rejects_gaps():
    with pytest.raises(ValueError, match="gap"):
        fold([ev(1, EventType.RUN_CREATED), ev(3, EventType.RUN_STARTED)])
