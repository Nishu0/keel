"""People, orgs and the credentials that tie them together."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from keel.core.events import utcnow


class Role(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    DEVELOPER = "developer"
    VIEWER = "viewer"


class Plan(StrEnum):
    FREE = "free"
    PRO = "pro"
    TEAM = "team"


class Identity(BaseModel):
    provider: str  # github, google, email
    subject: str  # the provider's stable id for this person


class User(BaseModel):
    id: str
    email: str
    name: str = ""
    avatar_url: str | None = None
    identities: list[Identity] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utcnow)


class Org(BaseModel):
    id: str
    name: str
    plan: Plan = Plan.FREE
    stripe_customer_id: str | None = None
    stripe_subscription_id: str | None = None
    created_at: datetime = Field(default_factory=utcnow)


class Membership(BaseModel):
    org_id: str
    user_id: str
    role: Role


class Session(BaseModel):
    id: str  # sha256 of the cookie token; the token itself is never stored
    user_id: str
    org_id: str  # the org this session is working in
    expires_at: datetime
    created_at: datetime = Field(default_factory=utcnow)


class ApiKey(BaseModel):
    id: str
    org_id: str
    name: str
    prefix: str  # first 12 characters, for lookup
    hash: str  # sha256 of the whole key
    role: Role
    created_by: str
    created_at: datetime = Field(default_factory=utcnow)
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None


class Invite(BaseModel):
    id: str  # sha256 of the token
    org_id: str
    email: str
    role: Role
    invited_by: str
    expires_at: datetime
    accepted_at: datetime | None = None


class MagicLink(BaseModel):
    id: str  # sha256 of the token
    email: str
    expires_at: datetime
    used_at: datetime | None = None


class Secret(BaseModel):
    id: str
    org_id: str
    name: str
    ciphertext: str  # base64
    nonce: str  # base64
    created_by: str
    updated_at: datetime = Field(default_factory=utcnow)


class ToolDef(BaseModel):
    """An org's own tool: an https webhook, or one tool discovered on an MCP server."""

    id: str
    org_id: str
    name: str  # what the model sees; [a-zA-Z0-9_-], unique in the org
    kind: str  # "webhook" | "mcp"
    description: str = ""
    effect: str = "external"  # pure | sandboxed | external
    input_schema: dict = Field(default_factory=lambda: {"type": "object", "properties": {}})
    url: str = ""
    timeout_s: float = 30.0
    # webhook
    reconcile_url: str | None = None
    signing_secret: str | None = None  # name of an org secret holding the hmac key
    # mcp
    server: str | None = None  # the server's short name, shared by its tools
    remote_name: str | None = None  # the tool's name on the server
    auth_secret: str | None = None  # name of an org secret sent as the Authorization header
    created_at: datetime = Field(default_factory=utcnow)


class Schedule(BaseModel):
    """Run an agent on a cron. ``next_run_at`` doubles as the claim: a worker fires a schedule
    only by moving it forward from the value it read."""

    id: str
    org_id: str
    agent_id: str
    name: str
    cron: str  # five fields, UTC
    task: str
    enabled: bool = True
    next_run_at: datetime
    last_run_id: str | None = None
    created_by: str
    created_at: datetime = Field(default_factory=utcnow)


class Trigger(BaseModel):
    """A secret url that starts a run when something POSTs to it."""

    id: str  # sha256 of the url token
    org_id: str
    agent_id: str
    name: str
    task_template: str  # {field} placeholders filled from the JSON body
    created_by: str
    created_at: datetime = Field(default_factory=utcnow)
    last_fired_at: datetime | None = None
