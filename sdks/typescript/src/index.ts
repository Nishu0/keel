// keel client for TypeScript. Works anywhere fetch and streams exist (node 18+, deno, bun, browsers via a proxy).
//
//   const keel = new Keel({ apiKey: process.env.KEEL_API_KEY! });
//   const run = await keel.runs.create("agt_...", { task: "Rebalance FED-DEC" });
//   for await (const event of keel.runs.stream(run.id)) console.log(event.type);

export type RunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "waiting_for_approval"
  | "needs_review"
  | "completed"
  | "failed"
  | "cancelled";

export interface Run {
  id: string;
  agent_id: string;
  status: RunStatus;
  input: Record<string, unknown>;
  last_seq: number;
  parent_run_id: string | null;
  steps?: number;
  output?: string | null;
  in_doubt?: string[];
  usage?: { input_tokens: number; output_tokens: number; cost_usd: number };
}

export interface RunEvent {
  org_id: string;
  run_id: string;
  seq: number;
  type: string;
  step: number;
  payload: Record<string, unknown>;
  ts: string;
}

export interface Agent {
  id: string;
  name: string;
  version: number;
  model: string;
  system_prompt: string;
  tools: string[];
  approval_required: string[];
}

export class KeelError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`${status}: ${detail}`);
  }
}

const TERMINAL = new Set(["run.completed", "run.failed", "run.cancelled", "limit.exceeded"]);

export class Keel {
  readonly runs: Runs;
  readonly agents: Agents;
  private readonly baseUrl: string;

  constructor(private readonly opts: { apiKey: string; baseUrl?: string; fetch?: typeof fetch }) {
    if (!opts.apiKey) throw new Error("apiKey is required");
    this.baseUrl = (opts.baseUrl ?? "http://localhost:8000").replace(/\/$/, "");
    this.runs = new Runs(this);
    this.agents = new Agents(this);
  }

  /** @internal */
  async request<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<Response & { json(): Promise<T> }> {
    const f = this.opts.fetch ?? fetch;
    const res = await f(`${this.baseUrl}${path}`, {
      ...init,
      method,
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      let detail = text;
      try {
        detail = (JSON.parse(text) as { detail?: string }).detail ?? text;
      } catch {}
      throw new KeelError(res.status, detail);
    }
    return res;
  }

  /** @internal */
  async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    return (await this.request<T>(method, path, body)).json();
  }
}

class Runs {
  constructor(private readonly k: Keel) {}

  create(agentId: string, input: Record<string, unknown>) {
    return this.k.json<Run>("POST", "/v1/runs", { agent_id: agentId, input });
  }
  get(runId: string) {
    return this.k.json<Run>("GET", `/v1/runs/${encodeURIComponent(runId)}`);
  }
  list(params: { status?: RunStatus; agentId?: string; limit?: number } = {}) {
    const q = new URLSearchParams();
    if (params.status) q.set("status", params.status);
    if (params.agentId) q.set("agent_id", params.agentId);
    if (params.limit) q.set("limit", String(params.limit));
    return this.k.json<Run[]>("GET", `/v1/runs${q.size ? `?${q}` : ""}`);
  }
  cancel(runId: string) {
    return this.k.json<Run>("POST", `/v1/runs/${encodeURIComponent(runId)}/cancel`);
  }
  approve(runId: string, callId: string, approve = true) {
    return this.k.json<Run>("POST", `/v1/runs/${encodeURIComponent(runId)}/approve`, { call_id: callId, approve });
  }
  resume(runId: string, callId: string, decision: "landed" | "retry" | "fail", output?: unknown) {
    return this.k.json<Run>("POST", `/v1/runs/${encodeURIComponent(runId)}/resume`, { call_id: callId, decision, output });
  }

  /** Events as they happen. Ends on a terminal event, or when the run pauses for a person. */
  async *stream(runId: string, afterSeq = 0): AsyncGenerator<RunEvent> {
    let last = afterSeq;
    for (;;) {
      let res: Response;
      try {
        res = await this.k.request("GET", `/v1/runs/${encodeURIComponent(runId)}/stream`, undefined, {
          headers: { "Last-Event-ID": String(last) },
        });
      } catch (e) {
        if (e instanceof KeelError) throw e;
        continue; // network blip: reconnect from the last seq
      }
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return; // closed without a terminal event: paused
        buf += value;
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const data = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!data) continue;
          const event = JSON.parse(data.slice(6)) as RunEvent;
          last = event.seq;
          yield event;
          if (TERMINAL.has(event.type)) return;
        }
      }
    }
  }
}

class Agents {
  constructor(private readonly k: Keel) {}

  create(config: Partial<Omit<Agent, "id" | "version">> & { name: string }) {
    return this.k.json<Agent>("POST", "/v1/agents", config);
  }
  update(id: string, config: Partial<Omit<Agent, "id" | "version">> & { name: string }) {
    return this.k.json<Agent>("POST", "/v1/agents", { id, ...config });
  }
  get(id: string) {
    return this.k.json<Agent>("GET", `/v1/agents/${encodeURIComponent(id)}`);
  }
  list() {
    return this.k.json<Agent[]>("GET", "/v1/agents");
  }
}
