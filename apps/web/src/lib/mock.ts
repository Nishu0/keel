import type { Agent, Org, Run, RunEvent, Tool } from "./types";

// Stand-in data until the web app talks to the api. Shapes match the api docs.

export const org: Org = { id: "org_8f2k", name: "Halyard Labs", plan: "pro" };

export const me = { id: "usr_01", name: "Ana Ruiz", initials: "AR", role: "owner" as const };

export const tools: Tool[] = [
  { id: "web_fetch", name: "web_fetch", kind: "builtin", effect: "pure", description: "Fetch a url and return readable text.", timeout_s: 20 },
  { id: "search", name: "search", kind: "builtin", effect: "pure", description: "Web search, top 10 results with snippets.", timeout_s: 15 },
  { id: "run_python", name: "run_python", kind: "sandbox", effect: "sandboxed", description: "Run python in a gVisor sandbox. No network.", timeout_s: 60 },
  { id: "run_shell", name: "run_shell", kind: "sandbox", effect: "sandboxed", description: "Run a shell command in a throwaway container.", timeout_s: 60 },
  { id: "get_orderbook", name: "get_orderbook", kind: "webhook", effect: "pure", description: "Read the order book for a market.", url: "https://desk.halyard.dev/keel/orderbook", timeout_s: 10 },
  { id: "place_order", name: "place_order", kind: "webhook", effect: "external", description: "Place a limit order. Sends Idempotency-Key.", url: "https://desk.halyard.dev/keel/place_order", reconcile: true, timeout_s: 30 },
  { id: "send_slack", name: "send_slack", kind: "mcp", effect: "external", description: "Post a message to a Slack channel.", reconcile: false, timeout_s: 15 },
  { id: "github_pr", name: "github.create_pr", kind: "mcp", effect: "external", description: "Open a pull request on GitHub.", reconcile: true, timeout_s: 30 },
];

export const agents: Agent[] = [
  {
    id: "agt_trader",
    name: "trading-agent",
    description: "Keeps the prediction market book inside its risk bands.",
    version: 7,
    model: { provider: "anthropic", name: "claude-sonnet-5-5" },
    system_prompt:
      "You manage a small prediction market book.\nStay inside the risk bands in the task. Read the book before you trade.\nNever place more than one order per market per step. Explain each trade in one line.",
    tools: ["get_orderbook", "place_order", "run_python", "web_fetch"],
    approval_required: ["place_order"],
    limits: { max_steps: 60, max_tokens: 400_000, timeout_s: 3600 },
    updated_at: "2026-11-24T06:12:00Z",
    updated_by: "Ana Ruiz",
  },
  {
    id: "agt_research",
    name: "research-agent",
    description: "Reads sources, cross checks claims, writes a cited brief.",
    version: 12,
    model: { provider: "anthropic", name: "claude-opus-5-5" },
    system_prompt:
      "You write short research briefs. Every claim needs a source you fetched yourself.\nPrefer primary sources. Say plainly when sources disagree.",
    tools: ["search", "web_fetch", "run_python"],
    approval_required: [],
    limits: { max_steps: 80, max_tokens: 800_000, timeout_s: 5400 },
    updated_at: "2026-11-23T17:40:00Z",
    updated_by: "Ira Menon",
  },
  {
    id: "agt_triage",
    name: "inbox-triage",
    description: "Sorts support threads and drafts replies for a human to send.",
    version: 3,
    model: { provider: "openai", name: "gpt-5.2-mini" },
    system_prompt: "Label each thread: bug, billing, question, or noise. Draft a reply for questions only.",
    tools: ["search", "send_slack"],
    approval_required: ["send_slack"],
    limits: { max_steps: 30, max_tokens: 120_000, timeout_s: 900 },
    updated_at: "2026-11-20T09:02:00Z",
    updated_by: "Sam Okafor",
  },
  {
    id: "agt_release",
    name: "release-notes",
    description: "Turns merged pull requests into release notes and opens a PR.",
    version: 5,
    model: { provider: "bedrock", name: "claude-haiku-5-5" },
    system_prompt: "Group merged PRs by area. One line each, user facing language. Open a PR against docs/.",
    tools: ["run_shell", "github_pr"],
    approval_required: [],
    limits: { max_steps: 25, max_tokens: 150_000, timeout_s: 1200 },
    updated_at: "2026-11-18T13:22:00Z",
    updated_by: "Ana Ruiz",
  },
];

const T0 = Date.parse("2026-11-24T07:41:08Z");
const iso = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

export const runs: Run[] = [
  {
    id: "run_01JDX4K9TQ",
    agent_id: "agt_trader",
    agent_version: 7,
    parent_run_id: null,
    status: "completed",
    input: { task: "Rebalance the FED-DEC book toward 60/40 yes/no. Max 400 contracts per order." },
    output: "Bought 240 YES at 0.58 on FED-DEC. Book is now 61/39. No other markets touched.",
    steps: 6,
    usage: { input_tokens: 48_210, output_tokens: 3_904, sandbox_s: 4, cost_usd: 0.21 },
    started_by: { type: "user", name: "Ana Ruiz" },
    worker: "w-3",
    created_at: iso(0),
    duration_ms: 94_300,
  },
  {
    id: "run_01JDX51MZR",
    agent_id: "agt_research",
    agent_version: 12,
    parent_run_id: null,
    status: "running",
    input: { task: "Compare gVisor and Firecracker cold start numbers published in 2026. Cite everything." },
    output: null,
    steps: 14,
    usage: { input_tokens: 212_400, output_tokens: 11_020, sandbox_s: 31, cost_usd: 1.84 },
    started_by: { type: "user", name: "Ira Menon" },
    worker: "w-1",
    created_at: iso(9 * 60_000),
    duration_ms: null,
  },
  {
    id: "run_01JDX3PB8C",
    agent_id: "agt_trader",
    agent_version: 7,
    parent_run_id: null,
    status: "needs_review",
    input: { task: "Close out the CPI-NOV position before settlement." },
    output: null,
    steps: 2,
    usage: { input_tokens: 31_002, output_tokens: 2_118, sandbox_s: 0, cost_usd: 0.14 },
    started_by: { type: "api_key", name: "kl_live_9x2c" },
    worker: "w-2",
    created_at: iso(-22 * 60_000),
    duration_ms: null,
  },
  {
    id: "run_01JDX5T0AA",
    agent_id: "agt_triage",
    agent_version: 3,
    parent_run_id: null,
    status: "waiting_for_approval",
    input: { task: "Triage the overnight support queue." },
    output: null,
    steps: 9,
    usage: { input_tokens: 40_880, output_tokens: 6_301, sandbox_s: 0, cost_usd: 0.06 },
    started_by: { type: "api_key", name: "kl_live_cron" },
    created_at: iso(12 * 60_000),
    duration_ms: null,
  },
  {
    id: "run_01JDX5XQ2W",
    agent_id: "agt_research",
    agent_version: 12,
    parent_run_id: "run_01JDX51MZR",
    status: "running",
    input: { task: "Pull the Firecracker numbers from the 2026 OSDI paper." },
    output: null,
    steps: 3,
    usage: { input_tokens: 18_200, output_tokens: 890, sandbox_s: 0, cost_usd: 0.12 },
    started_by: { type: "user", name: "research-agent" },
    worker: "w-4",
    created_at: iso(13 * 60_000),
    duration_ms: null,
  },
  {
    id: "run_01JDX5ZZ90",
    agent_id: "agt_release",
    agent_version: 5,
    parent_run_id: null,
    status: "queued",
    input: { task: "Release notes for v0.9.0 from main since v0.8.2." },
    output: null,
    steps: 0,
    usage: { input_tokens: 0, output_tokens: 0, sandbox_s: 0, cost_usd: 0 },
    started_by: { type: "api_key", name: "kl_live_ci" },
    created_at: iso(14 * 60_000),
    duration_ms: null,
  },
  {
    id: "run_01JDX2C4LM",
    agent_id: "agt_release",
    agent_version: 5,
    parent_run_id: null,
    status: "completed",
    input: { task: "Release notes for v0.8.2." },
    output: "Opened docs PR #412 with 17 changes grouped under runtime, ui, and sdk.",
    steps: 8,
    usage: { input_tokens: 61_500, output_tokens: 4_420, sandbox_s: 12, cost_usd: 0.05 },
    started_by: { type: "api_key", name: "kl_live_ci" },
    worker: "w-1",
    created_at: iso(-3 * 3600_000),
    duration_ms: 141_000,
  },
  {
    id: "run_01JDX1R7HD",
    agent_id: "agt_research",
    agent_version: 11,
    parent_run_id: null,
    status: "failed",
    input: { task: "Summarise every Fed statement since 2019." },
    output: null,
    steps: 80,
    usage: { input_tokens: 798_400, output_tokens: 22_100, sandbox_s: 66, cost_usd: 6.12 },
    started_by: { type: "user", name: "Ira Menon" },
    worker: "w-2",
    created_at: iso(-5 * 3600_000),
    duration_ms: 2_870_000,
  },
  {
    id: "run_01JDX0GG3K",
    agent_id: "agt_triage",
    agent_version: 3,
    parent_run_id: null,
    status: "cancelled",
    input: { task: "Triage the weekend support queue." },
    output: null,
    steps: 2,
    usage: { input_tokens: 6_100, output_tokens: 410, sandbox_s: 0, cost_usd: 0.01 },
    started_by: { type: "user", name: "Sam Okafor" },
    created_at: iso(-7 * 3600_000),
    duration_ms: 12_400,
  },
  {
    id: "run_01JDWZ8N1F",
    agent_id: "agt_trader",
    agent_version: 6,
    parent_run_id: null,
    status: "completed",
    input: { task: "Read the GDP-Q4 book and report spread. Do not trade." },
    output: "Spread is 3 cents. Depth is thin above 0.61. No trades placed.",
    steps: 3,
    usage: { input_tokens: 12_900, output_tokens: 980, sandbox_s: 0, cost_usd: 0.05 },
    started_by: { type: "user", name: "Ana Ruiz" },
    worker: "w-1",
    created_at: iso(-26 * 3600_000),
    duration_ms: 21_800,
  },
];

// ---------- event logs ----------

type Draft = Omit<RunEvent, "seq" | "run_id" | "ts"> & { at: number };

function log(run_id: string, start: number, drafts: Draft[]): RunEvent[] {
  return drafts.map((d, i) => ({
    seq: i + 1,
    run_id,
    type: d.type,
    step: d.step,
    payload: d.payload,
    ts: new Date(start + d.at).toISOString(),
  }));
}

const showcase = log("run_01JDX4K9TQ", T0, [
  { at: 0, step: 0, type: "run.created", payload: { by: "Ana Ruiz", queue: "org_8f2k" } },
  { at: 410, step: 0, type: "run.started", payload: { worker: "w-2", lease_ttl_s: 20 } },

  { at: 430, step: 1, type: "model.requested", payload: { model: "claude-sonnet-5-5", messages: 2 } },
  { at: 3_210, step: 1, type: "model.completed", payload: {
    text: "Reading the FED-DEC book before sizing anything.",
    tool_calls: [{ name: "get_orderbook", input: { market_id: "FED-DEC" } }],
    usage: { input: 6_120, output: 214 }, cost_usd: 0.022 } },
  { at: 3_230, step: 1, type: "tool.started", payload: { call_id: "tc_7a1e09", name: "get_orderbook", effect: "pure", input: { market_id: "FED-DEC" } } },
  { at: 3_640, step: 1, type: "tool.completed", payload: { call_id: "tc_7a1e09", duration_ms: 410, output: {
    best_bid: 0.57, best_ask: 0.58, position: { yes: 820, no: 760 }, depth_at_ask: 1_900 } } },

  { at: 3_660, step: 2, type: "model.requested", payload: { model: "claude-sonnet-5-5", messages: 4 } },
  { at: 7_020, step: 2, type: "model.completed", payload: {
    text: "Book is 52/48. Sizing the order to land near 60/40.",
    tool_calls: [{ name: "run_python", input: { code: "yes, no = 820, 760\nfor n in range(0, 401, 10):\n    if (yes + n) / (yes + no + n) >= 0.6:\n        print(n); break" } }],
    usage: { input: 6_990, output: 388 }, cost_usd: 0.027 } },
  { at: 7_040, step: 2, type: "tool.started", payload: { call_id: "tc_c3f5b2", name: "run_python", effect: "sandboxed", input: { code: "yes, no = 820, 760\nfor n in range(0, 401, 10):\n    if (yes + n) / (yes + no + n) >= 0.6:\n        print(n); break" }, sandbox: { image: "python-3.13", runtime: "runsc", warm: true } } },
  { at: 7_910, step: 2, type: "tool.completed", payload: { call_id: "tc_c3f5b2", duration_ms: 870, output: { stdout: "240\n", exit_code: 0 } } },

  { at: 7_930, step: 3, type: "model.requested", payload: { model: "claude-sonnet-5-5", messages: 6 } },
  { at: 11_480, step: 3, type: "model.completed", payload: {
    text: "Checking for any Fed news in the last hour before I trade.",
    tool_calls: [{ name: "web_fetch", input: { url: "https://www.federalreserve.gov/newsevents.htm" } }],
    usage: { input: 7_610, output: 241 }, cost_usd: 0.027 } },
  { at: 11_500, step: 3, type: "tool.started", payload: { call_id: "tc_19dd40", name: "web_fetch", effect: "pure", input: { url: "https://www.federalreserve.gov/newsevents.htm" } } },
  { at: 12_710, step: 3, type: "tool.completed", payload: { call_id: "tc_19dd40", duration_ms: 1_210, output: { title: "News & Events", chars: 18_204, excerpt: "No statements since Nov 7." } } },

  { at: 12_730, step: 4, type: "model.requested", payload: { model: "claude-sonnet-5-5", messages: 8 } },
  // w-2 is oom killed here. lease runs out 20s later, the sweeper re-queues, w-3 picks it up.
  { at: 36_900, step: 4, type: "run.resumed", payload: {
    from_worker: "w-2", to_worker: "w-3", reason: "lease expired", replayed_events: 15,
    reused: { model_calls: 3, tool_calls: 3 }, redo: "model call for step 4 (no model.completed recorded)" } },
  { at: 36_920, step: 4, type: "model.requested", payload: { model: "claude-sonnet-5-5", messages: 8, attempt: 2 } },
  { at: 40_610, step: 4, type: "model.completed", payload: {
    text: "No news. Buying 240 YES at 0.58 to reach 60/40.",
    tool_calls: [{ name: "place_order", input: { market_id: "FED-DEC", side: "yes", size: 240, limit: 0.58 } }],
    usage: { input: 8_204, output: 302 }, cost_usd: 0.029 } },
  { at: 40_630, step: 4, type: "approval.requested", payload: { call_id: "tc_4be81f", name: "place_order", input: { market_id: "FED-DEC", side: "yes", size: 240, limit: 0.58 } } },
  { at: 71_200, step: 4, type: "approval.granted", payload: { call_id: "tc_4be81f", by: "Ana Ruiz" } },
  { at: 71_900, step: 4, type: "tool.started", payload: { call_id: "tc_4be81f", name: "place_order", effect: "external", idempotency_key: "tc_4be81f", input: { market_id: "FED-DEC", side: "yes", size: 240, limit: 0.58 } } },
  { at: 72_640, step: 4, type: "tool.completed", payload: { call_id: "tc_4be81f", duration_ms: 740, attempts: 1, output: { order_id: "ord_55120", filled: 240, avg_price: 0.58, status: "filled" } } },

  { at: 72_660, step: 5, type: "model.requested", payload: { model: "claude-sonnet-5-5", messages: 10 } },
  { at: 75_010, step: 5, type: "model.completed", payload: {
    text: "Confirming the new position.",
    tool_calls: [{ name: "get_orderbook", input: { market_id: "FED-DEC" } }],
    usage: { input: 8_870, output: 180 }, cost_usd: 0.03 } },
  { at: 75_030, step: 5, type: "tool.started", payload: { call_id: "tc_e0aa71", name: "get_orderbook", effect: "pure", input: { market_id: "FED-DEC" } } },
  { at: 75_390, step: 5, type: "tool.completed", payload: { call_id: "tc_e0aa71", duration_ms: 360, output: { best_bid: 0.58, best_ask: 0.59, position: { yes: 1_060, no: 760 } } } },

  { at: 75_410, step: 6, type: "model.requested", payload: { model: "claude-sonnet-5-5", messages: 12 } },
  { at: 94_100, step: 6, type: "model.completed", payload: {
    text: "Bought 240 YES at 0.58 on FED-DEC. Book is now 61/39. No other markets touched.",
    tool_calls: [], usage: { input: 10_416, output: 2_579 }, cost_usd: 0.05 } },
  { at: 94_300, step: 6, type: "run.completed", payload: { output: "Bought 240 YES at 0.58 on FED-DEC. Book is now 61/39. No other markets touched." } },
]);

const T_REVIEW = Date.parse("2026-11-24T07:19:08Z");
const review = log("run_01JDX3PB8C", T_REVIEW, [
  { at: 0, step: 0, type: "run.created", payload: { by: "kl_live_9x2c" } },
  { at: 300, step: 0, type: "run.started", payload: { worker: "w-2", lease_ttl_s: 20 } },
  { at: 320, step: 1, type: "model.requested", payload: { model: "claude-sonnet-5-5", messages: 2 } },
  { at: 2_900, step: 1, type: "model.completed", payload: { text: "Reading CPI-NOV.", tool_calls: [{ name: "get_orderbook", input: { market_id: "CPI-NOV" } }], usage: { input: 5_900, output: 160 }, cost_usd: 0.02 } },
  { at: 2_920, step: 1, type: "tool.started", payload: { call_id: "tc_aa0193", name: "get_orderbook", effect: "pure", input: { market_id: "CPI-NOV" } } },
  { at: 3_300, step: 1, type: "tool.completed", payload: { call_id: "tc_aa0193", duration_ms: 380, output: { best_bid: 0.31, best_ask: 0.33, position: { yes: 0, no: 500 } } } },
  { at: 3_320, step: 2, type: "model.requested", payload: { model: "claude-sonnet-5-5", messages: 4 } },
  { at: 6_100, step: 2, type: "model.completed", payload: { text: "Selling 500 NO to close.", tool_calls: [{ name: "place_order", input: { market_id: "CPI-NOV", side: "no", size: -500, limit: 0.67 } }], usage: { input: 6_400, output: 210 }, cost_usd: 0.03 } },
  { at: 6_130, step: 2, type: "tool.started", payload: { call_id: "tc_5d02e7", name: "place_order", effect: "external", idempotency_key: "tc_5d02e7", input: { market_id: "CPI-NOV", side: "no", size: -500, limit: 0.67 } } },
  { at: 29_400, step: 2, type: "run.resumed", payload: { from_worker: "w-2", to_worker: "w-4", reason: "lease expired", replayed_events: 9, reused: { model_calls: 2, tool_calls: 1 } } },
  { at: 29_420, step: 2, type: "tool.failed", payload: { call_id: "tc_5d02e7", in_doubt: true, reason: "reconcile endpoint returned 503 three times. Not retrying an external call blind." } },
]);

export const eventsByRun: Record<string, RunEvent[]> = {
  run_01JDX4K9TQ: showcase,
  run_01JDX3PB8C: review,
};

export const agentById = (id: string) => agents.find((a) => a.id === id);
export const runById = (id: string) => runs.find((r) => r.id === id);
export const toolById = (id: string) => tools.find((t) => t.id === id);
