import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Button, StatusDot } from "@/components/ui";
import { ago, statusLabel, usd } from "@/lib/format";
import { agents, runs, toolById } from "@/lib/mock";

export const metadata: Metadata = { title: "Agents" };

export default function AgentsPage() {
  return (
    <>
      <PageHeader
        title="Agents"
        sub="Each agent is a versioned config: a prompt, a model, the tools it may call, and its limits."
        actions={<Button variant="primary"><Plus className="size-3.5" /> New agent</Button>}
      />
      <ul className="grid gap-px bg-rule sm:grid-cols-2 2xl:grid-cols-3">
        {agents.map((a) => {
          const mine = runs.filter((r) => r.agent_id === a.id).sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at));
          const last = mine[0];
          const spend = mine.reduce((s, r) => s + r.usage.cost_usd, 0);
          return (
            <li key={a.id} className="bg-paper">
              <Link href={`/app/agents/${a.id}`} className="flex h-full flex-col px-6 py-6 transition-colors hover:bg-wash lg:px-10">
                <div className="flex items-baseline gap-2">
                  <h2 className="font-serif text-[26px] leading-none text-ink">{a.name}</h2>
                  <span className="text-[12.5px] text-faint">v{a.version}</span>
                </div>
                <p className="mt-2 max-w-[44ch] text-[14px] text-ink-2">{a.description}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {a.tools.map((t) => {
                    const tool = toolById(t);
                    const gated = a.approval_required.includes(t);
                    return (
                      <span key={t} className="inline-flex h-6 items-center gap-1 rounded-md border border-rule bg-raised px-2 font-mono text-[11.5px] text-ink-2">
                        {tool?.name ?? t}
                        {gated && <span className="font-sans text-[11px] text-st-review">approval</span>}
                      </span>
                    );
                  })}
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-6 text-[12.5px] text-muted">
                  <span className="font-mono text-[11.5px]">{a.model.name}</span>
                  {last ? (
                    <span className="inline-flex items-center gap-1.5">
                      <StatusDot status={last.status} />
                      {statusLabel[last.status]} {ago(last.created_at)}
                    </span>
                  ) : (
                    <span>No runs yet</span>
                  )}
                  <span className="tnum">{mine.length} runs, {usd(spend)}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
