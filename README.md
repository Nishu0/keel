# keel

a durable runtime for agents. runs survive crashes, tools never fire twice, and you can see every step after the fact.

- **resume anywhere.** every step is appended to an event log before and after it has an effect. kill a worker mid run and the next one folds the log and carries on from the last finished step. completed model calls are never paid for twice.
- **at most once.** each tool call gets a stable id from `(run_id, step, call_index)`. external tools receive it as an idempotency key. if a worker dies mid call, keel asks the tool's reconcile hook what happened, and if there isn't one, the run waits for a person instead of guessing.
- **on the record.** the run page shows each step: model input and output, tool inputs and outputs, timings, tokens, cost. replay steps through a finished run one event at a time.
- **your tools.** connect MCP servers or signed https webhooks. every tool has an effect level (pure, sandboxed, external) that decides what happens when a call is in doubt.
- **teams of agents.** an agent can hand a task to another agent. the child runs on its own, the parent waits without holding a worker, and the answer comes back as the tool result.
- **multi user.** github, google or email sign in, orgs, roles, api keys, encrypted secrets, plans and stripe billing.

## layout

```
apps/
  web/        nextjs ui: landing, sign in, dashboard, runs and replay, agents, tools, usage, settings, billing
  api/        fastapi app: auth, rbac, tenancy, sse, tools, billing
keel/
  core/       events, fold, ids, run status state machine, agent config
  worker/     the loop, leases and heartbeat, sweeper, handoffs, worker process
  tools/      registry with effect levels, builtins, webhooks, mcp, per org tool sets
  accounts/   users, orgs, sessions, keys, invites, secrets, plans, stripe
  store/      memory and mongo stores with the same guarantees
  providers/  claude (anthropic api or bedrock), scripted providers for tests and demos
  sandbox/    docker sandbox for run_python and run_shell
  security/   secret redaction, aes-gcm sealing
  client.py   python sdk;  cli.py: keel run / watch / runs
sdks/typescript  typescript sdk
tests/        unit, api, auth, tenancy, mcp, handoffs, billing, chaos, mongo integration
deploy/       dockerfiles and compose
```

## configure

copy `.env.example` to `.env` at the repo root. the api, the worker and the web app all read it. the essentials:

| variable | what for |
|---|---|
| `KEEL_SESSION_SECRET`, `KEEL_MASTER_KEY` | sessions and secret encryption; generate with `openssl rand` |
| `GITHUB_*`, `GOOGLE_*`, `RESEND_API_KEY` | sign in options; without resend, sign in links print to the api log |
| `ANTHROPIC_API_KEY` | keel provided model access |
| `STRIPE_*` | billing; without it the billing page shows plans but can't upgrade |
| `KEEL_MONGO_URL` | durable storage; without it everything is in memory |

## run it

```bash
uv sync && (cd apps/web && pnpm install)
uv run pytest                                                   # everything except mongo
uv run uvicorn keel_api.main:app --app-dir apps/api --port 8000  # api; KEEL_EMBEDDED_WORKER=1 runs a worker inside it
uv run python -m keel.worker                                    # a separate worker
cd apps/web && pnpm dev                                         # web app on :3000

# everything, with mongo, redis and jaeger
docker compose -f deploy/docker-compose.yml up --build
```

set `KEEL_PROVIDER=demo` to try runs, approvals and handoffs without a model key.

## writing a tool

```python
from keel.tools.registry import Registry

tools = Registry()

async def order_status(idempotency_key: str):
    return await desk.orders.find(key=idempotency_key)  # None if it never landed

@tools.tool(effect="external", timeout_s=30, reconcile=order_status)
async def place_order(market_id: str, side: str, size: float, idempotency_key: str):
    """Place a limit order."""
    return await desk.orders.create(market_id, side, size, key=idempotency_key)
```

the input schema comes from the signature. `idempotency_key` is filled in by keel and hidden from the model. tools living elsewhere can be added from the tools page as an MCP server or a signed webhook instead.
