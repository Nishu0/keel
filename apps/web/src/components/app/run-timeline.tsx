"use client";

import { AlertTriangle, Check, ChevronRight, Clock, CornerDownRight, Hand, Loader2, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { fold, type CallState, type StepView, type ToolCallView } from "@/lib/fold";
import { clock, cx, ms, tokens, usd } from "@/lib/format";
import type { RunEvent } from "@/lib/types";
import { Button, EffectTag, Mono } from "../ui";
import { Json } from "./json";

type Tab = "steps" | "events";

export function RunTimeline({ events, model }: { events: RunEvent[]; model: string }) {
  const view = useMemo(() => fold(events), [events]);
  const [tab, setTab] = useState<Tab>("steps");
  const [open, setOpen] = useState<Set<number>>(() => {
    // open the steps that need a human, or the last one
    const flagged = view.steps.filter((s) => s.resumes.length || s.calls.some((c) => c.state !== "completed")).map((s) => s.n);
    return new Set(flagged.length ? flagged : view.steps.slice(-1).map((s) => s.n));
  });

  const toggle = (n: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  const allOpen = open.size === view.steps.length;

  return (
    <section aria-label="Run timeline">
      <div className="flex items-center gap-1 border-b border-rule pb-2.5">
        {(["steps", "events"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cx("h-7 rounded-md px-2.5 text-[13px]", tab === t ? "bg-wash font-medium text-ink" : "text-muted hover:text-ink")}
          >
            {t === "steps" ? `Steps ${view.steps.length}` : `Event log ${events.length}`}
          </button>
        ))}
        {tab === "steps" && (
          <button
            onClick={() => setOpen(allOpen ? new Set() : new Set(view.steps.map((s) => s.n)))}
            className="ml-auto h-7 rounded-md px-2.5 text-[13px] text-muted hover:text-ink"
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>

      {tab === "steps" ? (
        <ol className="mt-3">
          {view.steps.map((s, i) => (
            <Step key={s.n} step={s} model={model} open={open.has(s.n)} onToggle={() => toggle(s.n)} last={i === view.steps.length - 1} />
          ))}
          {view.final && <Final type={view.final.type} payload={view.final.payload} ts={view.ended_at!} />}
        </ol>
      ) : (
        <EventLog events={events} />
      )}
    </section>
  );
}

/* ---------------- step ---------------- */

function Step({ step, model, open, onToggle, last }: { step: StepView; model: string; open: boolean; onToggle: () => void; last: boolean }) {
  const m = step.model;
  const toks = m?.usage ? m.usage.input + m.usage.output : 0;
  const flagged = step.calls.find((c) => c.state === "in_doubt" || c.state === "awaiting_approval" || c.state === "failed");

  return (
    <li className="relative pl-9">
      {/* rail */}
      <span aria-hidden className={cx("absolute left-[13px] top-0 w-px bg-rule-strong", last ? "h-5" : "h-full")} />
      <span
        aria-hidden
        className={cx(
          "tnum absolute left-0 top-2.5 flex size-[27px] items-center justify-center rounded-full border bg-raised text-[11.5px]",
          flagged ? "border-st-review text-st-review" : "border-rule-strong text-muted",
        )}
      >
        {step.n}
      </span>

      {step.resumes.map((r) => (
        <div key={r.ts} className="mb-2 mt-1 rounded-md border border-rule bg-wash px-3.5 py-2.5 text-[13px]">
          <p className="flex items-center gap-2 text-ink">
            <RotateCcw className="size-3.5 shrink-0 text-st-running" />
            <span>
              Worker <Mono>{r.from_worker}</Mono> stopped. Its {r.reason}. Resumed on <Mono>{r.to_worker}</Mono>.
            </span>
            <span className="tnum ml-auto text-[12px] text-faint">{clock(r.ts)}</span>
          </p>
          <p className="mt-1 pl-[22px] text-muted">
            Replayed {r.replayed_events} events
            {r.reused && <>, reused {r.reused.model_calls} model and {r.reused.tool_calls} tool results without calling them again</>}.
            {r.redo && <> Redid the {r.redo}.</>}
          </p>
        </div>
      ))}

      <div className={cx("mb-2 rounded-lg border transition-colors", open ? "border-rule-strong bg-raised" : "border-transparent hover:bg-wash")}>
        <button onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left">
          <div className="min-w-0 flex-1">
            <p className={cx("text-[14px] text-ink", !open && "truncate")}>
              {m?.pending ? <span className="text-shimmer">Calling {model}</span> : m?.text}
            </p>
            {step.calls.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {step.calls.map((c) => (
                  <span key={c.call_id} className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                    <CallIcon state={c.state} />
                    <Mono className="text-ink-2">{c.name}</Mono>
                    {c.duration_ms != null && <span className="tnum text-faint">{ms(c.duration_ms)}</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="tnum flex shrink-0 items-center gap-4 pt-0.5 text-[12.5px] text-muted">
            {toks > 0 && <span className="hidden sm:inline">{tokens(toks)} tok</span>}
            {m?.cost_usd != null && <span className="hidden sm:inline">{usd(m.cost_usd)}</span>}
            <span className="w-12 text-right">{clock(step.started_at).slice(3)}</span>
            <ChevronRight className={cx("size-4 text-faint transition-transform", open && "rotate-90")} />
          </div>
        </button>

        {open && (
          <div className="border-t border-rule px-3.5 pb-4 pt-3">
            {m && !m.pending && (
              <Block
                title="Model"
                meta={
                  <>
                    <Mono>{model}</Mono>
                    {m.duration_ms != null && <span>{ms(m.duration_ms)}</span>}
                    {m.usage && (
                      <span>
                        {tokens(m.usage.input)} in, {tokens(m.usage.output)} out
                      </span>
                    )}
                    {m.attempts > 1 && <span className="text-st-review">attempt {m.attempts}</span>}
                  </>
                }
              >
                <p className="text-[14px] leading-[1.6] text-ink">{m.text}</p>
                {m.tool_calls.length > 0 && <p className="mt-2 text-[12.5px] text-muted">Asked for {m.tool_calls.map((t) => t.name).join(", ")}.</p>}
              </Block>
            )}
            {step.calls.map((c) => (
              <CallBlock key={c.call_id} call={c} />
            ))}
            <p className="tnum mt-3 text-[11.5px] text-faint">
              events {step.seqs[0]}–{step.seqs[1]}
            </p>
          </div>
        )}
      </div>
    </li>
  );
}

function Block({ title, meta, children, tone }: { title: React.ReactNode; meta?: React.ReactNode; children: React.ReactNode; tone?: "review" }) {
  return (
    <div
      className={cx(
        "mt-3 rounded-md border first:mt-0",
        tone === "review" ? "border-[color-mix(in_oklab,var(--st-review)_40%,transparent)]" : "border-rule",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule px-3 py-2 text-[12.5px] text-muted">
        <span className="font-medium text-ink">{title}</span>
        {meta}
      </div>
      <div className="px-3 py-3">{children}</div>
    </div>
  );
}

function CallBlock({ call: c }: { call: ToolCallView }) {
  const review = c.state === "in_doubt" || c.state === "awaiting_approval";
  return (
    <Block
      tone={review ? "review" : undefined}
      title={
        <span className="inline-flex items-center gap-2">
          <CornerDownRight className="size-3.5 text-faint" />
          <Mono>{c.name}</Mono>
        </span>
      }
      meta={
        <>
          <EffectTag effect={c.effect} />
          <span className="inline-flex items-center gap-1.5">
            <CallIcon state={c.state} />
            {stateLabel[c.state]}
          </span>
          {c.duration_ms != null && <span className="tnum">{ms(c.duration_ms)}</span>}
          <Mono className="ml-auto text-[11.5px] text-faint">{c.call_id}</Mono>
        </>
      }
    >
      {c.approval && (
        <p className="mb-3 flex items-center gap-2 text-[13px] text-ink-2">
          <Hand className="size-3.5 text-muted" />
          {c.approval.granted_at ? (
            <>
              {c.approval.denied ? "Denied" : "Approved"} by {c.approval.by} after{" "}
              {ms(Date.parse(c.approval.granted_at) - Date.parse(c.approval.requested_at))}.
            </>
          ) : (
            <>This agent needs a person to approve {c.name} before it runs.</>
          )}
        </p>
      )}
      {c.state === "in_doubt" && (
        <div className="mb-3 rounded-md bg-[color-mix(in_oklab,var(--st-review)_8%,transparent)] px-3 py-2.5 text-[13px] text-ink">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-3.5 text-st-review" />
            keel can&apos;t tell whether this call reached the tool.
          </p>
          <p className="mt-1 pl-[22px] text-ink-2">{c.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2 pl-[22px]">
            <Button size="sm" variant="primary">It went through, record it</Button>
            <Button size="sm">It didn&apos;t, send it again</Button>
            <Button size="sm" variant="ghost">Fail the run</Button>
          </div>
        </div>
      )}
      {c.state === "awaiting_approval" && (
        <div className="mb-3 flex gap-2">
          <Button size="sm" variant="primary"><Check className="size-3.5" /> Approve</Button>
          <Button size="sm"><X className="size-3.5" /> Deny</Button>
        </div>
      )}
      {c.idempotency_key && (
        <p className="mb-3 flex items-center gap-2 text-[12.5px] text-muted">
          <ShieldCheck className="size-3.5 text-st-completed" />
          Sent with <Mono className="text-ink-2">Idempotency-Key: {c.idempotency_key}</Mono>
        </p>
      )}
      {c.sandbox && (
        <p className="mb-3 text-[12.5px] text-muted">
          Sandbox <Mono className="text-ink-2">{c.sandbox.image}</Mono> on <Mono className="text-ink-2">{c.sandbox.runtime}</Mono>,{" "}
          {c.sandbox.warm ? "warm container" : "cold start"}, destroyed after the call.
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-[12px] text-muted">Input</p>
          <Json value={c.input} className="rounded-md bg-wash px-3 py-2" />
        </div>
        <div>
          <p className="mb-1 text-[12px] text-muted">Output</p>
          {c.output !== undefined ? (
            <Json value={c.output} className="rounded-md bg-wash px-3 py-2" />
          ) : (
            <p className="rounded-md border border-dashed border-rule-strong px-3 py-2 text-[12.5px] text-faint">Nothing recorded</p>
          )}
        </div>
      </div>
    </Block>
  );
}

const stateLabel: Record<CallState, string> = {
  running: "Running",
  awaiting_approval: "Waiting for approval",
  completed: "Done",
  failed: "Failed",
  in_doubt: "In doubt",
  denied: "Denied",
};

function CallIcon({ state }: { state: CallState }) {
  switch (state) {
    case "completed":
      return <Check className="size-3.5 text-st-completed" />;
    case "running":
      return <Loader2 className="size-3.5 animate-spin text-st-running" />;
    case "awaiting_approval":
      return <Clock className="size-3.5 text-st-review" />;
    case "in_doubt":
      return <AlertTriangle className="size-3.5 text-st-review" />;
    default:
      return <X className="size-3.5 text-st-failed" />;
  }
}

function Final({ type, payload, ts }: { type: string; payload: Record<string, unknown>; ts: string }) {
  const ok = type === "run.completed";
  return (
    <li className="relative pl-9">
      <span
        aria-hidden
        className={cx("absolute left-[3px] top-1 flex size-[21px] items-center justify-center rounded-full", ok ? "bg-st-completed" : "bg-st-failed")}
      >
        {ok ? <Check className="size-3 text-white" strokeWidth={3} /> : <X className="size-3 text-white" strokeWidth={3} />}
      </span>
      <div className="px-3.5 pb-2">
        <p className="text-[13px] text-muted">
          {ok ? "Finished" : "Stopped"} at <span className="tnum">{clock(ts)}</span>
        </p>
        {typeof payload.output === "string" && <p className="mt-1 font-serif text-[22px] leading-[1.25] text-ink">{payload.output}</p>}
      </div>
    </li>
  );
}

/* ---------------- raw log ---------------- */

function EventLog({ events }: { events: RunEvent[] }) {
  const [sel, setSel] = useState<number | null>(null);
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-rule bg-raised">
      <table className="w-full text-left text-[13px]">
        <thead className="text-[12px] text-muted">
          <tr className="border-b border-rule">
            <th className="w-12 px-3 py-2 text-right font-normal">seq</th>
            <th className="w-12 px-3 py-2 text-right font-normal">step</th>
            <th className="px-3 py-2 font-normal">type</th>
            <th className="hidden px-3 py-2 font-normal md:table-cell">summary</th>
            <th className="w-24 px-3 py-2 text-right font-normal">time</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <EventRow key={e.seq} e={e} open={sel === e.seq} onClick={() => setSel(sel === e.seq ? null : e.seq)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventRow({ e, open, onClick }: { e: RunEvent; open: boolean; onClick: () => void }) {
  const tone = e.type.endsWith("failed") ? "text-st-failed" : e.type === "run.resumed" ? "text-st-running" : e.type.startsWith("approval") ? "text-st-review" : "text-ink";
  return (
    <>
      <tr onClick={onClick} className={cx("cursor-pointer border-b border-rule last:border-0 hover:bg-wash", open && "bg-wash")}>
        <td className="tnum px-3 py-1.5 text-right font-mono text-[12px] text-faint">{e.seq}</td>
        <td className="tnum px-3 py-1.5 text-right font-mono text-[12px] text-faint">{e.step}</td>
        <td className={cx("px-3 py-1.5 font-mono text-[12.5px]", tone)}>{e.type}</td>
        <td className="hidden max-w-0 truncate px-3 py-1.5 text-[12.5px] text-muted md:table-cell">{summary(e)}</td>
        <td className="tnum px-3 py-1.5 text-right font-mono text-[12px] text-faint">{clock(e.ts)}</td>
      </tr>
      {open && (
        <tr className="border-b border-rule bg-wash">
          <td colSpan={5} className="px-6 pb-3 pt-1">
            <Json value={e.payload} />
          </td>
        </tr>
      )}
    </>
  );
}

function summary(e: RunEvent): string {
  const p = e.payload as Record<string, unknown>;
  if (typeof p.text === "string") return p.text;
  if (typeof p.name === "string") return `${p.name} ${p.call_id ?? ""}`;
  if (typeof p.call_id === "string") return String(p.call_id);
  if (typeof p.worker === "string") return `worker ${p.worker}`;
  if (typeof p.to_worker === "string") return `${p.from_worker} → ${p.to_worker}, ${p.reason}`;
  if (typeof p.output === "string") return p.output;
  if (typeof p.model === "string") return `${p.model}, ${p.messages} messages`;
  return "";
}
