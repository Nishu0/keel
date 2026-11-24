"""Run events. The append only log is the source of truth for every run."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class EventType(StrEnum):
    RUN_CREATED = "run.created"
    RUN_STARTED = "run.started"
    RUN_RESUMED = "run.resumed"
    MODEL_REQUESTED = "model.requested"
    MODEL_COMPLETED = "model.completed"
    MODEL_FAILED = "model.failed"
    TOOL_REQUESTED = "tool.requested"
    TOOL_STARTED = "tool.started"
    TOOL_COMPLETED = "tool.completed"
    TOOL_FAILED = "tool.failed"
    APPROVAL_REQUESTED = "approval.requested"
    APPROVAL_GRANTED = "approval.granted"
    APPROVAL_DENIED = "approval.denied"
    HANDOFF_STARTED = "handoff.started"
    HANDOFF_COMPLETED = "handoff.completed"
    RUN_CANCEL_REQUESTED = "run.cancel_requested"
    RUN_COMPLETED = "run.completed"
    RUN_FAILED = "run.failed"
    RUN_CANCELLED = "run.cancelled"
    LIMIT_EXCEEDED = "limit.exceeded"


TERMINAL = {EventType.RUN_COMPLETED, EventType.RUN_FAILED, EventType.RUN_CANCELLED, EventType.LIMIT_EXCEEDED}


def utcnow() -> datetime:
    return datetime.now(UTC)


class Event(BaseModel):
    """One immutable record in a run's log. ``(run_id, seq)`` is unique."""

    org_id: str
    run_id: str
    seq: int
    type: EventType
    step: int = 0
    payload: dict[str, Any] = Field(default_factory=dict)
    ts: datetime = Field(default_factory=utcnow)

    model_config = {"frozen": True}
