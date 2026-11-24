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
    return (
      <div className="mx-4 rounded-xl border border-dashed border-border px-6 py-16 text-center lg:mx-6">
        <p className="font-serif text-[28px] text-foreground">Your first run starts here.</p>
        <p className="mx-auto mt-2 max-w-[44ch] text-[15px] text-muted-foreground">
          Create an agent with a prompt and the tools it may call, then give it a task. Every step shows up here as it happens.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/app/agents" className="btn-sheen inline-flex h-9 items-center rounded-lg px-4 text-[14px] text-foreground">
            Create an agent
          </Link>
          <Link href="/app/runs/run_01JDX4K9TQ" className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-[14px] text-foreground hover:bg-wash">
            See an example run
          </Link>
        </div>
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
