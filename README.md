# keel

a durable runtime for agents. runs survive crashes, tools never fire twice, and you can see every step after the fact.

- **resume anywhere.** every step is appended to an event log before and after it has an effect. kill a worker mid run and the next one folds the log and carries on from the last finished step. completed model calls are never paid for twice.
- **at most once.** each tool call gets a stable id from `(run_id, step, call_index)`. external tools receive it as an idempotency key. if a worker dies mid call, keel asks the tool's reconcile hook what happened, and if there isn't one, the run waits for a person instead of guessing.
- **on the record.** the run page shows each step: model input and output, tool inputs and outputs, timings, tokens, cost.

## layout

```
apps/
  web/        nextjs ui (landing, runs, run timeline, agents, tools, usage, settings)
  api/        fastapi app (auth, rbac, tenancy, sse)
keel/
  core/       events, fold, ids, run status state machine, agent config
  worker/     the loop, leases + heartbeat, sweeper, worker process
  tools/      registry with effect levels, builtin tools
  store/      memory and mongo stores with the same guarantees
  providers/  provider interface, scripted fake for tests
  cli.py      keel run / keel watch / keel runs
tests/
  unit/       fold, registry, loop, api, tenancy
  chaos/      random worker kills, asserts zero duplicate side effects
  integration/ mongo store against a real database
deploy/       dockerfiles and compose
```

## run it

```bash
# runtime + api
uv sync
uv run pytest                      # unit, api, tenancy, chaos
KEEL_DEV_API_KEY=kl_live_local_dev_key uv run uvicorn keel_api.main:app --app-dir apps/api --reload

# worker (in memory unless KEEL_MONGO_URL is set)
uv run python -m keel.worker

# web
cd apps/web && pnpm install && pnpm dev

# everything, with mongo, redis and jaeger
cp deploy/.env.example deploy/.env
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up --build
```

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

the input schema comes from the signature. `idempotency_key` is filled in by keel and hidden from the model.

## status

early. working: event log, fold, leases, sweeper, effect levels, reconcile, approvals, needs review, the api, the ui on stand in data. next: real provider adapters, sandbox, per org queues, wiring the ui to the api.
