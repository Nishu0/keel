"use client";

import { CornerDownRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ago, cx, isLive, ms, tokens, usd } from "@/lib/format";
import { agentById, runs } from "@/lib/mock";
import type { Run } from "@/lib/types";
import { Avatar, Mono, StatusBadge } from "../ui";

const FILTERS = [
  { id: "all", label: "All", match: () => true },
  { id: "live", label: "Live", match: (r: Run) => isLive(r.status) || r.status === "queued" },
  { id: "attention", label: "Needs a decision", match: (r: Run) => r.status === "needs_review" || r.status === "waiting_for_approval" },
  { id: "completed", label: "Completed", match: (r: Run) => r.status === "completed" },
  { id: "failed", label: "Failed or cancelled", match: (r: Run) => r.status === "failed" || r.status === "cancelled" },
] as const;

export function RunsTable() {
  const params = useSearchParams();
  const router = useRouter();
  const active = FILTERS.find((f) => f.id === params.get("status")) ?? FILTERS[0];
  const agent = params.get("agent");

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v && v !== "all") next.set(k, v);
    else next.delete(k);
    const qs = next.toString();
    router.replace(qs ? `/app/runs?${qs}` : "/app/runs", { scroll: false });
  };

  const filtered = runs
    .filter(active.match)
    .filter((r) => !agent || r.agent_id === agent)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  // keep child runs directly under their parent when both are visible
  const ordered: Run[] = [];
  for (const r of filtered.filter((r) => !r.parent_run_id || !filtered.some((p) => p.id === r.parent_run_id))) {
    ordered.push(r, ...filtered.filter((c) => c.parent_run_id === r.id));
  }

  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, runs.filter(f.match).length]));
  const agentsInRuns = [...new Set(runs.map((r) => r.agent_id))].map((id) => agentById(id)!);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-rule px-6 py-2.5 lg:px-10">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => set("status", f.id)}
            className={cx(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors",
              active.id === f.id ? "bg-wash font-medium text-ink" : "text-muted hover:text-ink",
            )}
          >
            {f.label}
            <span className="tnum text-[12px] text-faint">{counts[f.id]}</span>
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-[13px] text-muted">
          Agent
          <select
            value={agent ?? "all"}
            onChange={(e) => set("agent", e.target.value)}
            className="h-7 rounded-md border border-rule bg-raised px-2 text-[13px] text-ink"
          >
            <option value="all">Any</option>
            {agentsInRuns.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      </div>

      {ordered.length === 0 ? (
        <Empty filtered={active.id !== "all" || !!agent} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-[13.5px]">
            <thead className="text-[12.5px] text-muted">
              <tr className="border-b border-rule">
                <th className="py-2.5 pl-6 pr-3 font-normal lg:pl-10">Status</th>
                <th className="px-3 py-2.5 font-normal">Task</th>
                <th className="px-3 py-2.5 font-normal">Agent</th>
                <th className="px-3 py-2.5 text-right font-normal">Steps</th>
                <th className="px-3 py-2.5 text-right font-normal">Tokens</th>
                <th className="px-3 py-2.5 text-right font-normal">Cost</th>
                <th className="px-3 py-2.5 text-right font-normal">Duration</th>
                <th className="py-2.5 pl-3 pr-6 text-right font-normal lg:pr-10">Started</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((r) => (
                <Row key={r.id} run={r} child={!!r.parent_run_id && ordered.some((p) => p.id === r.parent_run_id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Row({ run, child }: { run: Run; child: boolean }) {
  const a = agentById(run.agent_id)!;
  const href = `/app/runs/${run.id}`;
  return (
    <tr className="group relative border-b border-rule transition-colors hover:bg-wash">
      <td className="py-3 pl-6 pr-3 align-top lg:pl-10">
        <Link href={href} className="absolute inset-0" aria-label={`Open ${run.id}`} />
        <StatusBadge status={run.status} />
      </td>
      <td className="max-w-[440px] px-3 py-3 align-top">
        <div className={cx("flex gap-2", child && "pl-4")}>
          {child && <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-faint" />}
          <div className="min-w-0">
            <p className="truncate text-ink">{run.input.task}</p>
            <p className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
              <Mono className="text-[11.5px]">{run.id}</Mono>
              <span className="inline-flex items-center gap-1">
                {run.started_by.type === "user" ? <Avatar name={run.started_by.name} className="size-3.5 text-[7px]" /> : null}
                {run.started_by.type === "api_key" ? <Mono className="text-[11.5px]">{run.started_by.name}</Mono> : run.started_by.name}
              </span>
            </p>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-3 align-top">
        <span className="text-ink-2">{a.name}</span>
        <span className="ml-1.5 text-[12px] text-faint">v{run.agent_version}</span>
      </td>
      <td className="tnum px-3 py-3 text-right align-top text-ink-2">{run.steps}</td>
      <td className="tnum px-3 py-3 text-right align-top text-ink-2">{tokens(run.usage.input_tokens + run.usage.output_tokens)}</td>
      <td className="tnum px-3 py-3 text-right align-top text-ink-2">{usd(run.usage.cost_usd)}</td>
      <td className="tnum whitespace-nowrap px-3 py-3 text-right align-top text-ink-2">
        {run.duration_ms ? ms(run.duration_ms) : isLive(run.status) ? <span className="text-st-running">live</span> : "–"}
      </td>
      <td className="tnum whitespace-nowrap py-3 pl-3 pr-6 text-right align-top text-muted lg:pr-10">{ago(run.created_at)}</td>
    </tr>
  );
}

function Empty({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center px-6 py-24 text-center">
      <p className="font-serif text-[26px] text-ink">{filtered ? "No runs match these filters." : "No runs yet."}</p>
      <p className="mt-2 max-w-[40ch] text-[14px] text-muted">
        {filtered ? "Clear the filters to see every run in this org." : "Start a run from an agent and it will show up here as it happens."}
      </p>
      {!filtered && (
        <Link href="/app/agents" className="mt-6 inline-flex h-8 items-center gap-1.5 rounded-md bg-ink px-3 text-[13.5px] font-medium text-paper">
          <Plus className="size-3.5" /> Pick an agent
        </Link>
      )}
    </div>
  );
}
