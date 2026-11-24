// Shapes mirror the api / mongo documents. The ui only ever reads these.

export type RunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "waiting_for_approval"
  | "needs_review"
  | "completed"
  | "failed"
  | "cancelled";

export type Effect = "pure" | "sandboxed" | "external";

export type Role = "owner" | "admin" | "developer" | "viewer";

export interface Org {
  id: string;
  name: string;
  plan: "free" | "pro" | "team";
}

export interface ModelRef {
  provider: "anthropic" | "openai" | "bedrock";
  name: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  version: number;
  model: ModelRef;
  system_prompt: string;
  tools: string[];
  approval_required: string[];
  limits: { max_steps: number; max_tokens: number; timeout_s: number };
  updated_at: string;
  updated_by: string;
}

export interface Tool {
  id: string;
  name: string;
  kind: "builtin" | "sandbox" | "webhook" | "mcp";
  effect: Effect;
  description: string;
  url?: string;
  reconcile?: boolean;
  timeout_s: number;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  sandbox_s: number;
  cost_usd: number;
}

export interface Run {
  id: string;
  agent_id: string;
  agent_version: number;
  parent_run_id: string | null;
  status: RunStatus;
  input: { task: string };
  output: string | null;
  steps: number;
  usage: Usage;
  started_by: { type: "user" | "api_key"; name: string };
  worker?: string;
  created_at: string;
  duration_ms: number | null;
}

export type EventType =
  | "run.created"
  | "run.started"
  | "run.resumed"
  | "model.requested"
  | "model.completed"
  | "model.failed"
  | "tool.requested"
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "approval.requested"
  | "approval.granted"
  | "approval.denied"
  | "handoff.started"
  | "handoff.completed"
  | "run.cancel_requested"
  | "run.completed"
  | "run.failed"
  | "run.cancelled"
  | "limit.exceeded";

export interface RunEvent {
  seq: number;
  run_id: string;
  type: EventType;
  step: number;
  ts: string;
  payload: Record<string, unknown>;
}
