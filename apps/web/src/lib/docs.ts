export type Block =
  | { p: string }
  | { h: string }
  | { code: string; lang?: string }
  | { list: string[] }
  | { table: string[][] }; // first row is the header

export type DocPage = { slug: string; group: string; title: string; lead: string; body: Block[] };

export const DOCS: DocPage[] = [
  {
    slug: "quickstart",
    group: "Start",
    title: "Quickstart",
    lead: "Create an agent, start a run and watch it from the dashboard. About five minutes.",
    body: [
      { h: "1. Get an api key" },
      { p: "Sign in, then open Settings → API keys and create a key. It's shown once. Keys start with kl_live_ and carry a role: a developer key can create agents and runs, a viewer key can only read." },
      { h: "2. Install the sdk" },
      { code: "pip install 'git+https://github.com/Nishu0/keel'  # python\nnpm install ./sdks/typescript  # typescript, from a checkout", lang: "bash" },
      { h: "3. Create an agent and run it" },
      {
        code: `from keel.client import Keel

keel = Keel(api_key="kl_live_...")

agent = keel.agents.create(
    name="researcher",
    system_prompt="Answer with sources.",
    tools=["web_fetch", "current_time"],
)
run = keel.runs.create(agent["id"], {"task": "What changed in the latest Python release?"})

for event in keel.runs.stream(run["id"]):
    print(event["seq"], event["type"])`,
        lang: "python",
      },
      { p: "Every line printed is an event in the run's log. Open the run in the dashboard to see the same events folded into steps, with tokens, cost and timings." },
      { h: "No code?" },
      { p: "On the Agents page, pick a template. keel creates the agent and starts its sample task so you can watch a run straight away, then edit the agent into your own." },
    ],
  },
  {
    slug: "runs",
    group: "Concepts",
    title: "Runs and the event log",
    lead: "A run is an append-only log of events. Everything else, including resume, replay and fork, is built by reading that log.",
    body: [
      { p: "Before a step has an effect, keel appends an event saying it's about to happen. After, it appends what happened. The run's state is never stored separately; it's the fold of its events." },
      {
        table: [
          ["Event", "Written when"],
          ["run.created", "The run is queued, with its input and the agent version"],
          ["model.requested / model.completed", "Around each model call, with the exact content blocks returned"],
          ["tool.started / tool.completed / tool.failed", "Around each tool call, keyed by its call id"],
          ["approval.requested / approved / denied", "A gated tool is waiting for a person"],
          ["handoff.started / handoff.completed", "Work was handed to another agent"],
          ["run.completed / run.failed / run.cancelled", "The run is finished"],
        ],
      },
      { h: "Statuses" },
      {
        list: [
          "queued: waiting for a worker",
          "running: a worker holds its lease and is driving it",
          "waiting_for_approval: a gated tool call needs a person",
          "needs_review: a tool call is in doubt and keel won't guess",
          "waiting: a child agent is working; no worker is held",
          "completed, failed, cancelled, limit_exceeded: finished",
        ],
      },
      { p: "Events are unique on (run_id, seq). Two workers can never both write step 7: the second append fails and that worker stops." },
    ],
  },
  {
    slug: "resume",
    group: "Concepts",
    title: "Crashes and resume",
    lead: "Kill a worker at any point. The next one picks the run up from the last finished step.",
    body: [
      { p: "A worker holds a lease on each run it drives and renews it with a heartbeat. If the heartbeat stops, a sweeper notices the lease expired and puts the run back in the queue." },
      { p: "The next worker reads the log and rebuilds the conversation from it. Model calls that completed are replayed from the log, byte for byte, including signed thinking blocks, so they're never paid for twice. Tool calls that completed are replayed from their recorded output." },
      { p: "The only open question is a tool call that started but never finished. What happens next depends on its effect level." },
      {
        table: [
          ["Effect", "Meaning", "In doubt"],
          ["pure", "Reads only, safe to repeat", "Run it again"],
          ["sandboxed", "Writes only inside a throwaway sandbox", "Run it again in a fresh sandbox"],
          ["external", "Changes something in the world", "Ask the tool's reconcile hook; if there isn't one, wait for a person"],
        ],
      },
    ],
  },
  {
    slug: "tools",
    group: "Building",
    title: "Tools",
    lead: "Python functions, MCP servers or signed webhooks. Each has an effect level and gets a stable idempotency key.",
    body: [
      { h: "In python" },
      {
        code: `from keel.tools.registry import Registry

tools = Registry()


async def order_status(idempotency_key: str):
    return await desk.orders.find(key=idempotency_key)  # None if it never landed


@tools.tool(effect="external", timeout_s=30, reconcile=order_status)
async def place_order(market_id: str, side: str, size: float, idempotency_key: str):
    """Place a limit order."""
    return await desk.orders.create(market_id, side, size, key=idempotency_key)`,
        lang: "python",
      },
      { p: "The input schema comes from the signature and the docstring becomes the description. idempotency_key is filled in by keel and hidden from the model. It's derived from (run_id, step, call_index), so a retried call always carries the same key." },
      { h: "MCP servers" },
      { p: "On the Tools page, add a streamable http MCP server. keel lists its tools and registers each as server__tool. Tools the server marks read only become pure; everything else is external. The idempotency key is sent in the call's _meta as keel/idempotency_key." },
      { h: "Webhooks" },
      { p: "A webhook tool is an https endpoint keel POSTs the tool's arguments to as JSON. Each request is signed with HMAC-SHA256 over the timestamp, a dot and the raw body, using a secret you store in Secrets, and carries an Idempotency-Key header that stays the same on every retry of one call." },
      { code: "POST /your/endpoint\nIdempotency-Key: tc_3f9a...\nX-Keel-Timestamp: 1764000000\nX-Keel-Signature: v1=8c1e...\n\n{\"market_id\": \"fed-dec\", \"side\": \"buy\", \"size\": 10}", lang: "http" },
    ],
  },
  {
    slug: "approvals",
    group: "Building",
    title: "Approvals and review",
    lead: "Put a person in front of the tools that matter. Settle calls keel can't be sure about.",
    body: [
      { p: "List a tool in an agent's approval_required and every call to it pauses the run as waiting_for_approval. The worker is released while it waits; a run can sit there for days and costs nothing." },
      { code: `keel.runs.approve(run_id, call_id)                 # carry on
keel.runs.approve(run_id, call_id, approve=False)  # the model is told it was denied`, lang: "python" },
      { p: "A run lands in needs_review when an external tool call is in doubt and there's no reconcile hook. Tell keel what really happened:" },
      { code: `keel.runs.resume(run_id, call_id, "landed", output={"order_id": "o_81"})  # it went through
keel.runs.resume(run_id, call_id, "retry")  # it didn't; call again with the same key
keel.runs.resume(run_id, call_id, "fail")   # give the model an error instead`, lang: "python" },
      { p: "Owners and admins get an email when a run starts waiting. Add a SLACK_WEBHOOK_URL secret to post to a channel as well." },
    ],
  },
  {
    slug: "handoffs",
    group: "Building",
    title: "Handing work to other agents",
    lead: "An agent can give a task to another agent and use the answer as a tool result.",
    body: [
      { p: "Set agents on an agent config to the ids it may hand work to. Each shows up to the model as a handoff__<name> tool that takes a task." },
      { p: "When the model calls it, keel starts a child run with a deterministic id, so a retried handoff finds the same child instead of starting another. The parent moves to waiting and releases its worker. When the child finishes, the parent is queued again and the child's answer comes back as the tool result." },
      { p: "Child runs are ordinary runs: they have their own log, show up in the dashboard and count toward your plan." },
    ],
  },
  {
    slug: "fork",
    group: "Debugging",
    title: "Replay, fork and compare",
    lead: "Step through what happened, rerun from any step with a change, and see exactly where two runs part ways.",
    body: [
      { h: "Replay" },
      { p: "The Replay tab on a run steps through its events one at a time with the arrow keys and explains each one. Nothing is re-executed." },
      { h: "Fork" },
      { p: "Fork from step N creates a new run that reuses the log up to step N and continues live from there. Optionally fork onto a newer agent version, or swap a recorded tool output to see what the model does with different data." },
      { code: `POST /v1/runs/{run_id}/fork
{"from_step": 3, "agent_version": 4, "tool_outputs": {"tc_3f9a...": {"price": 0.41}}}`, lang: "http" },
      { h: "Compare" },
      { p: "Compare runs puts two runs side by side, step by step, with the first step where they differ and the change in steps, tokens and cost. A forked run links straight to a comparison with its source." },
    ],
  },
  {
    slug: "automations",
    group: "Operating",
    title: "Schedules and triggers",
    lead: "Start runs without anyone clicking: on a cron, or when something posts to a url.",
    body: [
      { h: "Schedules" },
      { p: "A schedule is a five field cron in UTC, an agent and a task. Every worker checks for due schedules, and each due time is claimed with a compare and set on the schedule, so it starts exactly one run however many workers are up. Paused schedules don't catch up on missed slots when resumed." },
      { h: "Triggers" },
      { p: "A trigger is a secret url. POST JSON to it and keel starts a run, filling {field} and {nested.field} placeholders in the task from the body. The url is shown once; anyone holding it can start runs." },
      { code: `curl -X POST 'https://keel.example/api/keel/v1/hooks/trg_...' \\
  -H 'content-type: application/json' \\
  -d '{"issue": {"number": 42, "title": "Crash on start"}}'

# task template: "Triage issue #{issue.number}: {issue.title}"
# run input:     "Triage issue #42: Crash on start"`, lang: "bash" },
      { p: "Both respect your plan: when monthly runs or tokens are used up, schedules skip and triggers answer 402." },
    ],
  },
  {
    slug: "self-host",
    group: "Operating",
    title: "Self hosting",
    lead: "One api, any number of workers, MongoDB for storage.",
    body: [
      { code: "cp .env.example .env\ndocker compose -f deploy/docker-compose.yml up --build", lang: "bash" },
      {
        table: [
          ["Variable", "What for"],
          ["KEEL_MONGO_URL", "Durable storage. Without it everything is in memory"],
          ["KEEL_SESSION_SECRET, KEEL_MASTER_KEY", "Sessions and secret encryption. Generate with openssl rand"],
          ["ANTHROPIC_API_KEY", "Model access. Set KEEL_PROVIDER=demo to try runs without one"],
          ["GITHUB_*, GOOGLE_*, RESEND_API_KEY", "Sign in options. Without Resend, sign in links print to the api log"],
          ["STRIPE_*", "Billing. Without it every org stays on the free plan"],
          ["KEEL_SANDBOX=docker", "Turns on run_python and run_shell"],
          ["KEEL_WORKER_CONCURRENCY", "Runs one worker drives at once. Default 4"],
        ],
      },
      { p: "Workers are stateless. Add more to drive more runs; scale them down at any time and their runs move to the others when the leases expire." },
    ],
  },
  {
    slug: "api",
    group: "Reference",
    title: "HTTP api",
    lead: "Authenticate with Authorization: Bearer kl_live_... Everything is scoped to the key's org.",
    body: [
      {
        table: [
          ["Method", "Path", "Does"],
          ["POST", "/v1/agents", "Create an agent, or a new version when id is set"],
          ["GET", "/v1/agents", "List agents"],
          ["POST", "/v1/runs", "Start a run: {agent_id, input}"],
          ["GET", "/v1/runs", "List runs, newest first; filter by status or agent_id"],
          ["GET", "/v1/runs/{id}", "One run"],
          ["GET", "/v1/runs/{id}/events", "Its events, from after_seq"],
          ["GET", "/v1/runs/{id}/stream", "Server sent events, live"],
          ["POST", "/v1/runs/{id}/approve", "{call_id, approve}"],
          ["POST", "/v1/runs/{id}/resume", "{call_id, decision, output}"],
          ["POST", "/v1/runs/{id}/fork", "{from_step, agent_version?, tool_outputs?}"],
          ["POST", "/v1/runs/{id}/cancel", "Cancel"],
          ["GET / POST", "/v1/schedules", "List or add schedules"],
          ["GET / POST", "/v1/triggers", "List or add triggers"],
          ["GET / POST", "/v1/templates", "List templates, or create an agent from one"],
          ["GET", "/v1/usage", "Runs, tokens and cost this month"],
        ],
      },
      { p: "Errors are JSON with a detail field. 402 means a plan limit; 409 means the run isn't in a state that allows the action." },
    ],
  },
];

export const docBySlug = (slug: string) => DOCS.find((d) => d.slug === slug);
