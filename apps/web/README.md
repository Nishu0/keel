# keel web

nextjs (app router) ui for keel: landing page, runs, run detail timeline, agents, tools, usage, settings.

```bash
pnpm install
pnpm dev
```

without an api the app shows demo data from `src/lib/mock.ts`. to go live, copy `.env.example` to `.env.local` and point it at a running api. the browser talks to `/api/keel/*`, a server side proxy that adds the api key, so the key never reaches the client. run pages stream events over sse and the approve, resolve and cancel buttons call the api.

for a local api without mongo, run it with an embedded worker and the scripted demo provider:

```bash
KEEL_DEV_API_KEY=... KEEL_EMBEDDED_WORKER=1 KEEL_PROVIDER=demo \
  uv run uvicorn keel_api.main:app --app-dir apps/api --port 8000
```

data shapes match the api documents, and `src/lib/fold.ts` derives the run timeline from the event log the same way the worker does.
