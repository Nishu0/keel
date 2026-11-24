"use client";

import { Square } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { tokens, usd } from "@/lib/format";
import type { RunStatus } from "@/lib/types";
import { Mono, StatusBadge } from "../kit";
import { ActionButton } from "./action-button";
import { PageHeader } from "./page-header";
import { RunTimeline } from "./run-timeline";

type ApiRun = {
  id: string;
  agent_id: string;
  status: RunStatus;
  input: { task?: string };
  steps: number;
  output: string | null;
  in_doubt: string[];
  usage: { input_tokens: number; output_tokens: number; cost_usd: number };
};
type ApiAgent = { id: string; name: string; version: number; model: string };

const TERMINAL: RunStatus[] = ["completed", "failed", "cancelled"];

/** A run that lives in the api rather than the demo data. */
export function LiveRun({ id }: { id: string }) {
  const [run, setRun] = useState<ApiRun | null>(null);
  const [agent, setAgent] = useState<ApiAgent | null>(null);
  const [missing, setMissing] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      const r = await fetch(`/api/keel/v1/runs/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!alive) return;
      if (!r.ok) {
        setMissing(r.status === 503 ? "The api isn't connected, and this run isn't in the demo data." : "No run with this id in your org.");
        return;
      }
      const data = (await r.json()) as ApiRun;
      setRun(data);
      if (!TERMINAL.includes(data.status)) timer = setTimeout(load, 1500);
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id]);

  useEffect(() => {
    if (!run?.agent_id || agent) return;
    fetch(`/api/keel/v1/agents/${encodeURIComponent(run.agent_id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((a: ApiAgent | null) => a && setAgent(a));
  }, [run?.agent_id, agent]);

  if (missing) {
    return (
      <div className="px-6 py-24 text-center lg:px-10">
        <p className="font-serif text-[28px] text-ink">Run not found.</p>
        <p className="mt-2 text-[14px] text-muted-foreground">{missing}</p>
        <Link href="/app/runs" className="mt-6 inline-block text-[14px] font-medium text-ink underline decoration-rule-strong underline-offset-4">
          Back to runs
        </Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        crumbs={
          <span className="flex items-center gap-2">
            <Link href="/app/runs" className="hover:text-ink">Runs</Link>
            <span className="text-faint">/</span>
            <Mono className="text-ink-2">{id}</Mono>
          </span>
        }
        title={<span className="block max-w-[34ch] text-[28px] leading-[1.15]">{run?.input.task ?? "Loading run"}</span>}
        sub={
          run && (
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <StatusBadge status={run.status} />
              {agent && (
                <span>
                  {agent.name} <span className="text-faint">v{agent.version}</span>
                </span>
              )}
            </span>
          )
        }
        actions={
          run && !TERMINAL.includes(run.status) ? (
            <ActionButton variant="danger" path={`/v1/runs/${id}/cancel`} done="Cancel requested.">
              <Square className="size-3 fill-current" /> Cancel run
            </ActionButton>
          ) : null
        }
      />
      <div className="grid gap-10 px-6 py-6 lg:px-10 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <RunTimeline runId={id} events={[]} model={agent?.model ?? "model"} />
        </div>
        {run && (
          <aside className="text-[13.5px] xl:sticky xl:top-6 xl:self-start">
            <dl className="divide-y divide-rule border-y border-rule">
              {[
                ["Steps", String(run.steps)],
                ["Tokens", `${tokens(run.usage.input_tokens)} in, ${tokens(run.usage.output_tokens)} out`],
                ["Cost", usd(run.usage.cost_usd)],
                ["Model", agent?.model ?? "–"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="tnum text-right text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </aside>
        )}
      </div>
    </>
  );
}
