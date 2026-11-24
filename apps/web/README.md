# keel web

nextjs (app router) ui for keel: landing page, runs, run detail timeline, agents, tools, usage, settings.

```bash
pnpm install
pnpm dev
```

data comes from `src/lib/mock.ts` until the api is wired in. shapes match the api documents, and `src/lib/fold.ts` derives the run timeline from the event log the same way the worker does.
