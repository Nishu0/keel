import { AlertTriangle, CornerDownRight, RotateCcw, Square } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ActionButton } from "@/components/app/action-button";
import { LiveRun } from "@/components/app/live-run";
import { PageHeader } from "@/components/app/page-header";
import { RunTimeline } from "@/components/app/run-timeline";
import { Avatar, Button, Mono, StatusBadge } from "@/components/kit";
import { ago, isLive, ms, tokens, usd } from "@/lib/format";
import { agentById, eventsByRun, runById, runs } from "@/lib/mock";

export function generateStaticParams() {
  return runs.map((r) => ({ id: r.id }));
}

export async function generateMetadata({ params }: PageProps<"/app/runs/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: id };
}

export default async function RunPage({ params }: PageProps<"/app/runs/[id]">) {
  const { id } = await params;
  const run = runById(id);
  if (!run) {
    // not in the demo data: it may be a real run in the api
    if (/^run_[0-9A-Z]{26}$/.test(id)) return <LiveRun id={id} />;
    notFound();
  }
  const agent = agentById(run.agent_id)!;
  const events = eventsByRun[run.id];
  const parent = run.parent_run_id ? runById(run.parent_run_id) : undefined;
  const children = runs.filter((r) => r.parent_run_id === run.id);
  const workers = events
    ? [...new Set(events.flatMap((e) => [e.payload.worker, e.payload.from_worker, e.payload.to_worker]).filter(Boolean))]
    : run.worker
      ? [run.worker]
      : [];
  const canCancel = isLive(run.status) || run.status === "queued" || run.status === "waiting_for_approval" || run.status === "needs_review";

  return (
    <>
      <PageHeader
        crumbs={
          <span className="flex items-center gap-2">
            <Link href="/app/runs" className="hover:text-ink">Runs</Link>
            <span className="text-faint">/</span>
            <Mono className="text-ink-2">{run.id}</Mono>
          </span>
        }
        title={<span className="block max-w-[34ch] text-[28px] leading-[1.15]">{run.input.task}</span>}
        sub={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <StatusBadge status={run.status} />
            <Link href={`/app/agents/${agent.id}`} className="hover:text-ink">
              {agent.name} <span className="text-faint">v{run.agent_version}</span>
            </Link>
            <span>started {ago(run.created_at)}</span>
          </span>
        }
        actions={
          <>
            {canCancel && (
              <ActionButton variant="danger" path={`/v1/runs/${run.id}/cancel`} done="Cancel requested.">
                <Square className="size-3 fill-current" /> Cancel run
              </ActionButton>
            )}
            {!canCancel && <Button><RotateCcw className="size-3.5" /> Run again</Button>}
          </>
        }
      />

      {run.status === "needs_review" && (
        <Banner>
          A <Mono>place_order</Mono> call was in flight when worker <Mono>w-2</Mono> died, and its reconcile check didn&apos;t answer. keel
          won&apos;t resend an external call without knowing, so this run is paused until someone decides. Step 2 has the details.
        </Banner>
      )}
      {run.status === "waiting_for_approval" && (
        <Banner>
          This run wants to post to Slack. <Mono>send_slack</Mono> needs approval on this agent, so the run is paused and holds no worker.
        </Banner>
      )}

      <div className="grid gap-10 px-6 py-6 lg:px-10 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          {events ? (
            <RunTimeline runId={run.id} events={events} model={agent.model.name} />
          ) : (
            <NoEvents live={isLive(run.status)} queued={run.status === "queued"} output={run.output} />
          )}
        </div>

        <aside className="space-y-8 text-[13.5px] xl:sticky xl:top-6 xl:self-start">
          <Meta
            rows={[
              ["Duration", run.duration_ms ? ms(run.duration_ms) : isLive(run.status) ? "Running" : "–"],
              ["Steps", `${run.steps} of ${agent.limits.max_steps}`],
              ["Tokens", `${tokens(run.usage.input_tokens)} in, ${tokens(run.usage.output_tokens)} out`],
              ["Sandbox", `${run.usage.sandbox_s}s`],
              ["Cost", usd(run.usage.cost_usd)],
            ]}
          />
          <Budget used={run.usage.input_tokens + run.usage.output_tokens} max={agent.limits.max_tokens} />
          <Meta
            rows={[
              [
                "Started by",
                <span key="by" className="inline-flex items-center gap-1.5">
                  {run.started_by.type === "user" ? <Avatar name={run.started_by.name} className="size-4 text-[8px]" /> : null}
                  {run.started_by.type === "api_key" ? <Mono>{run.started_by.name}</Mono> : run.started_by.name}
                </span>,
              ],
              ["Model", <Mono key="m">{agent.model.name}</Mono>],
              ["Workers", workers.length ? <Mono key="w">{workers.join(", ")}</Mono> : "None yet"],
            ]}
          />
          {(parent || children.length > 0) && (
            <div>
              <p className="mb-2 text-[12.5px] text-muted-foreground">{parent ? "Handed off from" : "Handoffs"}</p>
              <ul className="space-y-1.5">
                {(parent ? [parent] : children).map((r) => (
                  <li key={r.id}>
                    <Link href={`/app/runs/${r.id}`} className="group flex gap-2 rounded-md p-1.5 -mx-1.5 hover:bg-wash">
                      <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-faint" />
                      <span className="min-w-0">
                        <span className="block truncate text-ink">{r.input.task}</span>
                        <span className="mt-0.5 block"><StatusBadge status={r.status} /></span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-[color-mix(in_oklab,var(--st-review)_25%,transparent)] bg-[color-mix(in_oklab,var(--st-review)_7%,transparent)] px-6 py-3.5 text-[14px] leading-[1.55] text-ink lg:px-10">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-st-review" />
      <p className="max-w-[90ch]">{children}</p>
    </div>
  );
}

function Meta({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-rule border-y border-rule">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="tnum text-right text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Budget({ used, max }: { used: number; max: number }) {
  const pct = Math.min(100, (used / max) * 100);
  return (
    <div>
      <div className="flex justify-between text-[12.5px] text-muted-foreground">
        <span>Token budget</span>
        <span className="tnum">{pct.toFixed(0)}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-wash" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Token budget used">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 90 ? "var(--st-failed)" : "var(--ink)" }} />
      </div>
      <p className="tnum mt-1.5 text-[12px] text-faint">
        {tokens(used)} of {tokens(max)}
      </p>
    </div>
  );
}

function NoEvents({ live, queued, output }: { live: boolean; queued: boolean; output: string | null }) {
  return (
    <div className="rounded-lg border border-dashed border-rule-strong px-6 py-14 text-center">
      <p className="font-serif text-[24px] text-ink">
        {queued ? "Waiting for a worker." : live ? "Streaming from the worker." : "Event log not in the demo data."}
      </p>
      <p className="mx-auto mt-2 max-w-[46ch] text-[14px] text-muted-foreground">
        {queued
          ? "This run is in the org queue. It starts as soon as a worker has room under your concurrency limit."
          : "Steps appear here once the api is connected. Open run_01JDX4K9TQ for a full example."}
      </p>
      {output && <p className="mx-auto mt-6 max-w-[52ch] font-serif text-[20px] text-ink-2">{output}</p>}
      <Link href="/app/runs/run_01JDX4K9TQ" className="mt-6 inline-block text-[14px] font-medium text-ink underline decoration-rule-strong underline-offset-4">
        Open the example run
      </Link>
    </div>
  );
}
