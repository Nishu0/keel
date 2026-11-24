"""Run status state machine."""

from __future__ import annotations

from enum import StrEnum


class RunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    WAITING = "waiting"  # a child run is in progress
    WAITING_FOR_APPROVAL = "waiting_for_approval"
    NEEDS_REVIEW = "needs_review"  # an external call is in doubt
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


S = RunStatus

TRANSITIONS: dict[RunStatus, frozenset[RunStatus]] = {
    S.QUEUED: frozenset({S.RUNNING, S.CANCELLED}),
    S.RUNNING: frozenset(
        {S.COMPLETED, S.FAILED, S.CANCELLED, S.WAITING, S.WAITING_FOR_APPROVAL, S.QUEUED, S.NEEDS_REVIEW}
    ),
    S.WAITING: frozenset({S.RUNNING, S.CANCELLED, S.FAILED}),
    S.WAITING_FOR_APPROVAL: frozenset({S.QUEUED, S.CANCELLED}),
    S.NEEDS_REVIEW: frozenset({S.QUEUED, S.FAILED, S.CANCELLED}),
    S.COMPLETED: frozenset(),
    S.FAILED: frozenset(),
    S.CANCELLED: frozenset(),
}

TERMINAL_STATUSES = frozenset({S.COMPLETED, S.FAILED, S.CANCELLED})


class InvalidTransition(Exception):
    def __init__(self, src: RunStatus, dst: RunStatus) -> None:
        super().__init__(f"run cannot go from {src} to {dst}")
        self.src, self.dst = src, dst


def can_transition(src: RunStatus, dst: RunStatus) -> bool:
    return dst in TRANSITIONS[src]


def transition(src: RunStatus, dst: RunStatus) -> RunStatus:
    if not can_transition(src, dst):
        raise InvalidTransition(src, dst)
    return dst
