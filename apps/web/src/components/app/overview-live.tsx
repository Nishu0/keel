"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { DataTable, type RunRow } from "@/components/data-table";
import { SectionCards } from "@/components/section-cards";
import { useApi } from "@/lib/live";
import { fromRuns, idTime } from "@/lib/overview";
import type { Run } from "@/lib/types";

type ApiRun = {
  id: string;
  agent_id: string;
  status: Run["status"];
  input: { task?: string };
  parent_run_id: string | null;
  steps: number;
  output: string | null;
  usage: { input_tokens: number; output_tokens: number; cost_usd: number };
};
type ApiAgent = { id: string; name: string; version: number };

/** The overview with the org's real runs when the api is connected, the demo set otherwise. */
export function OverviewLive({ demoRows }: { demoRows: RunRow[] }) {
  const runs = useApi<ApiRun[]>("/v1/runs?limit=200");
  const agents = useApi<ApiAgent[]>("/v1/agents");

  const live = useMemo(() => {
    if (!runs.data || !agents.data) return null;
    const names = Object.fromEntries(agents.data.map((a) => [a.id, a]));
    const rows: RunRow[] = runs.data.map((r) => ({
      id: r.id,
      agent_id: r.agent_id,
      agent_name: names[r.agent_id]?.name ?? r.agent_id,
      agent_version: names[r.agent_id]?.version ?? 1,
      parent_run_id: r.parent_run_id,
      status: r.status,
      input: { task: r.input.task ?? JSON.stringify(r.input) },
      output: r.output,
      steps: r.steps,
      usage: { ...r.usage, sandbox_s: 0 },
      started_by: { type: "user", name: "" },
      created_at: new Date(idTime(r.id)).toISOString(),
      duration_ms: null,
    }));
    // anchored to the newest run, so the chart reads the same on server and client
    const now = runs.data.reduce((m, r) => Math.max(m, idTime(r.id)), 0) || Date.parse("2026-11-24T08:00:00Z");
    return { rows, ...fromRuns(runs.data, now) };
  }, [runs.data, agents.data]);

  if (live && live.rows.length === 0) {
    const steps: [string, string, string, string][] = [
      ["Start from a template", "Pick a starter agent. keel creates it and runs its sample task so you can watch every step land.", "/app/agents", "Pick a template"],
      ["Run it from your code", "Create an api key and start runs from python, typescript or plain http.", "/app/settings/keys", "Create a key"],
      ["Let it run on its own", "Put an agent on a schedule, or give it a url that starts a run when something posts to it.", "/app/automations", "Set up automations"],
    ];
    return (
      <div className="mx-4 rounded-xl border border-border px-6 py-10 lg:mx-6 lg:px-10">
        <p className="font-serif text-[30px] leading-tight text-foreground">Your first run starts here.</p>
        <p className="mt-2 max-w-[56ch] text-[15px] text-muted-foreground">
          Three steps from nothing to an agent that runs on its own. Every step of every run shows up on this page as it happens.
        </p>
        <ol className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
          {steps.map(([title, body, href, cta], i) => (
            <li key={title} className="flex flex-col bg-background p-5">
              <span className="tnum text-[13px] text-muted-foreground">Step {i + 1}</span>
              <p className="mt-1 text-[15.5px] text-foreground">{title}</p>
              <p className="mt-1.5 flex-1 text-[13.5px] leading-[1.55] text-ink-2">{body}</p>
              <Link
                href={href}
                className={`mt-5 inline-flex h-9 w-fit items-center rounded-lg px-4 text-[14px] text-foreground ${i === 0 ? "btn-sheen" : "border border-border hover:bg-wash"}`}
              >
                {cta}
              </Link>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-[13.5px] text-muted-foreground">
          New to keel? The <Link href="/docs/quickstart" className="text-foreground underline decoration-border underline-offset-4">quickstart</Link> takes about five minutes.
        </p>
      </div>
    );
  }

  return (
    <>
      <SectionCards stats={live?.stats} />
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive daily={live?.daily} />
      </div>
      <DataTable data={live?.rows ?? demoRows} />
    </>
  );
}
