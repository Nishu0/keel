import type { Effect, RunEvent } from "./types";

// Same idea as keel.core.fold on the worker: the event log is the source of
// truth and everything the ui shows is derived from it.

export type CallState = "running" | "awaiting_approval" | "completed" | "failed" | "in_doubt" | "denied";

export interface ToolCallView {
  call_id: string;
  name: string;
  effect: Effect;
  input: unknown;
  output?: unknown;
  state: CallState;
  duration_ms?: number;
  idempotency_key?: string;
  approval?: { requested_at: string; by?: string; granted_at?: string; denied?: boolean };
  sandbox?: { image: string; runtime: string; warm: boolean };
  reason?: string;
}

export interface ResumeView {
  ts: string;
  from_worker: string;
  to_worker: string;
  reason: string;
  replayed_events: number;
  reused?: { model_calls: number; tool_calls: number };
  redo?: string;
}

export interface StepView {
  n: number;
  started_at: string;
  ended_at?: string;
  model?: {
    text?: string;
    tool_calls: { name: string; input: unknown }[];
    usage?: { input: number; output: number };
    cost_usd?: number;
    attempts: number;
    duration_ms?: number;
    pending: boolean;
  };
  calls: ToolCallView[];
  resumes: ResumeView[];
  seqs: [number, number];
}

export interface RunView {
  steps: StepView[];
  created_at?: string;
  ended_at?: string;
  final?: { type: string; payload: Record<string, unknown> };
}

type P = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export function fold(events: RunEvent[]): RunView {
  const view: RunView = { steps: [] };
  const byN = new Map<number, StepView>();
  let modelStartedAt: string | undefined;

  const step = (e: RunEvent) => {
    let s = byN.get(e.step);
    if (!s) {
      s = { n: e.step, started_at: e.ts, calls: [], resumes: [], seqs: [e.seq, e.seq] };
      byN.set(e.step, s);
      view.steps.push(s);
    }
    s.seqs[1] = e.seq;
    s.ended_at = e.ts;
    return s;
  };

  const call = (s: StepView, p: P) => {
    const id = str(p.call_id)!;
    let c = s.calls.find((x) => x.call_id === id);
    if (!c) {
      c = { call_id: id, name: str(p.name) ?? "?", effect: (p.effect as Effect) ?? "pure", input: p.input, state: "running" };
      s.calls.push(c);
    }
    return c;
  };

  for (const e of events) {
    const p = e.payload as P;
    switch (e.type) {
      case "run.created":
        view.created_at = e.ts;
        break;
      case "run.started":
        break;
      case "model.requested": {
        const s = step(e);
        modelStartedAt = e.ts;
        s.model = { ...(s.model ?? { tool_calls: [] }), attempts: (s.model?.attempts ?? 0) + 1, pending: true };
        break;
      }
      case "model.completed": {
        const s = step(e);
        s.model = {
          text: str(p.text),
          tool_calls: (p.tool_calls as { name: string; input: unknown }[]) ?? [],
          usage: p.usage as { input: number; output: number },
          cost_usd: num(p.cost_usd),
          attempts: s.model?.attempts ?? 1,
          duration_ms: modelStartedAt ? Date.parse(e.ts) - Date.parse(modelStartedAt) : undefined,
          pending: false,
        };
        break;
      }
      case "approval.requested": {
        const c = call(step(e), p);
        c.state = "awaiting_approval";
        c.approval = { requested_at: e.ts };
        break;
      }
      case "approval.granted":
      case "approval.denied": {
        const c = call(step(e), p);
        c.approval = { ...(c.approval ?? { requested_at: e.ts }), by: str(p.by), granted_at: e.ts, denied: e.type === "approval.denied" };
        c.state = e.type === "approval.denied" ? "denied" : "running";
        break;
      }
      case "tool.started": {
        const c = call(step(e), p);
        c.state = "running";
        c.effect = (p.effect as Effect) ?? c.effect;
        c.input = p.input ?? c.input;
        c.idempotency_key = str(p.idempotency_key);
        c.sandbox = p.sandbox as ToolCallView["sandbox"];
        break;
      }
      case "tool.completed": {
        const c = call(step(e), p);
        c.state = "completed";
        c.output = p.output;
        c.duration_ms = num(p.duration_ms);
        break;
      }
      case "tool.failed": {
        const c = call(step(e), p);
        c.state = p.in_doubt ? "in_doubt" : "failed";
        c.reason = str(p.reason);
        break;
      }
      case "run.resumed": {
        const s = step(e);
        s.resumes.push({
          ts: e.ts,
          from_worker: str(p.from_worker) ?? "the previous worker",
          to_worker: str(p.to_worker) ?? str(p.worker) ?? "?",
          reason: str(p.reason) ?? "",
          replayed_events: num(p.replayed_events) ?? 0,
          reused: p.reused as ResumeView["reused"],
          redo: str(p.redo),
        });
        break;
      }
      case "run.completed":
      case "run.failed":
      case "run.cancelled":
      case "limit.exceeded":
        view.ended_at = e.ts;
        view.final = { type: e.type, payload: p };
        break;
      default:
        break;
    }
  }

  view.steps = view.steps.filter((s) => s.n > 0);
  return view;
}
