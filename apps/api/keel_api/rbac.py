"""Roles and what they may do. Checked on every route."""

from __future__ import annotations

from enum import StrEnum


class Role(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    DEVELOPER = "developer"
    VIEWER = "viewer"


class Action(StrEnum):
    VIEW = "view"  # agents, runs, usage
    WRITE_AGENTS = "write_agents"  # create and edit agents, start runs
    OPERATE_RUNS = "operate_runs"  # approve, resume, cancel
    MANAGE_TOOLS = "manage_tools"  # tools and secrets
    MANAGE_MEMBERS = "manage_members"  # members and api keys
    BILLING = "billing"  # billing, delete org


R = Role
ALLOWED: dict[Action, frozenset[Role]] = {
    Action.VIEW: frozenset(R),
    Action.WRITE_AGENTS: frozenset({R.OWNER, R.ADMIN, R.DEVELOPER}),
    Action.OPERATE_RUNS: frozenset({R.OWNER, R.ADMIN, R.DEVELOPER}),
    Action.MANAGE_TOOLS: frozenset({R.OWNER, R.ADMIN}),
    Action.MANAGE_MEMBERS: frozenset({R.OWNER, R.ADMIN}),
    Action.BILLING: frozenset({R.OWNER}),
}


def can(role: Role, action: Action) -> bool:
    return role in ALLOWED[action]
