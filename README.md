# keel

a durable runtime for agents. runs survive crashes, tools never fire twice, and you can see every step after the fact.

## layout

```
apps/
  web/      nextjs ui
  api/      fastapi app
keel/       shared python package (core, worker, providers, tools, store)
sdks/       python + typescript clients
tests/      unit, integration, chaos, tenancy, e2e
deploy/     docker compose, terraform
```

## status

early. building the ui and the core runtime first.
