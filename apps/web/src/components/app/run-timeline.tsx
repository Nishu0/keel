"use client";

import { AlertTriangle, Check, GitFork, ChevronLeft, ChevronRight, Clock, CornerDownRight, Hand, Loader2, Pause, Play, RotateCcw, ShieldCheck, SkipBack, SkipForward, X } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { fold, type CallState, type StepView, type ToolCallView } from "@/lib/fold";
import { clock, cx, ms, tokens, usd } from "@/lib/format";
import { useRunEvents, type Source } from "@/lib/live";
import type { RunEvent } from "@/lib/types";
import { EffectTag, Mono } from "../kit";
import { ActionButton } from "./action-button";
import { ForkButton } from "./fork-button";
import { Json } from "./json";

const RunCtx = createContext({ runId: "", ended: false });

type Tab = "steps" | "events" | "replay";

export function RunTimeline({ runId, events: initial, model }: { runId: string; events: RunEvent[]; model: string }) {
  const { events, source } = useRunEvents(runId, initial);
  const view = useMemo(() => fold(events), [events]);
  const [tab, setTab] = useState<Tab>("steps");
  // until someone toggles a step, open the ones that need a person (or the last one).
  // recomputed as live events arrive, so a step that starts waiting pops open.
  const [touched, setTouched] = useState<Set<number> | null>(null);
  const flagged = view.steps
    .filter((s) => s.resumes.some((r) => r.reason === "lease expired") || s.calls.some((c) => c.state !== "completed"))
    .map((s) => s.n);
  const open = touched ?? new Set(flagged.length ? flagged : view.steps.slice(-1).map((s) => s.n));
  const setOpen = (next: Set<number>) => setTouched(next);

  const toggle = (n: number) => {
    const next = new Set(open);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    setTouched(next);
  };
  const allOpen = open.size === view.steps.length;

  return (
    <RunCtx.Provider value={{ runId, ended: !!view.final }}>
    <section aria-label="Run timeline">
      <div className="flex items-center gap-1 border-b border-rule pb-2.5">
        {(["steps", "events", "replay"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cx("h-7 rounded-md px-2.5 text-[13px]", tab === t ? "bg-wash font-medium text-ink" : "text-muted-foreground hover:text-ink")}
          >
            {t === "steps" ? `Steps ${view.steps.length}` : t === "events" ? `Event log ${events.length}` : "Replay"}
          </button>
        ))}
        <SourceBadge source={source} />
        {tab === "steps" && (
          <button
            onClick={() => setOpen(allOpen ? new Set() : new Set(view.steps.map((s) => s.n)))}
            className="h-7 rounded-md px-2.5 text-[13px] text-muted-foreground hover:text-ink"
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>

      {view.forked_from && (
        <p className="mt-3 flex items-center gap-2 rounded-md border border-border px-3 py-2 text-[13px] text-ink-2">
          <GitFork className="size-3.5 text-muted-foreground" />
          Forked from
          <Link href={`/app/runs/${view.forked_from.run_id}`} className="font-mono text-[12.5px] text-foreground underline decoration-border underline-offset-4">
            {view.forked_from.run_id}
          </Link>
          at step {view.forked_from.step}. Steps before it were reused, not rerun.
          <Link href={`/app/runs/compare?a=${view.forked_from.run_id}&b=${runId}`} className="ml-auto font-medium text-foreground underline decoration-border underline-offset-4">
            Compare
          </Link>
        </p>
      )}
      {tab === "steps" ? (
        <ol className="mt-3">
          {view.steps.map((s, i) => (
            <Step key={s.n} step={s} model={model} open={open.has(s.n)} onToggle={() => toggle(s.n)} last={i === view.steps.length - 1} />
          ))}
          {view.final && <Final type={view.final.type} payload={view.final.payload} ts={view.ended_at!} />}
        </ol>
      ) : tab === "events" ? (
        <EventLog events={events} />
      ) : (
        <Replay events={events} model={model} />
      )}
    </section>
    </RunCtx.Provider>
  );
}

function SourceBadge({ source }: { source: Source }) {
  if (source === "connecting") return <span className="ml-auto" />;
  return (
    <span
      className="ml-auto mr-1 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground"
      title={source === "live" ? "Streaming from the keel api" : "Showing stand in data. Set KEEL_API_URL and KEEL_API_KEY to go live."}
    >
      <i className={cx("size-1.5 rounded-full", source === "live" ? "animate-pulse-dot bg-st-completed" : "bg-faint")} />
      {source === "live" ? "Live" : "Demo data"}
    </span>
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
          flagged ? "border-st-review text-st-review" : "border-rule-strong text-muted-foreground",
        )}
      >
        {step.n}
      </span>

      {step.resumes.map((r) =>
        r.reason !== "lease expired" ? (
          <p key={r.ts} className="mb-1.5 mt-1 flex items-center gap-2 px-3.5 text-[12.5px] text-muted-foreground">
            <RotateCcw className="size-3 shrink-0" />
            <span>
              Picked up on <Mono>{r.to_worker}</Mono> after {r.reason === "approval" ? "the approval" : "review"}.
            </span>
            <span className="tnum ml-auto text-[12px] text-faint">{clock(r.ts)}</span>
          </p>
        ) : (
        <div key={r.ts} className="mb-2 mt-1 rounded-md border border-rule bg-wash px-3.5 py-2.5 text-[13px]">
          <p className="flex items-center gap-2 text-ink">
            <RotateCcw className="size-3.5 shrink-0 text-st-running" />
            <span>
              Worker <Mono>{r.from_worker}</Mono> stopped. Its {r.reason}. Resumed on <Mono>{r.to_worker}</Mono>.
            </span>
            <span className="tnum ml-auto text-[12px] text-faint">{clock(r.ts)}</span>
          </p>
          <p className="mt-1 pl-[22px] text-muted-foreground">
            Replayed {r.replayed_events} events
            {r.reused && <>, reused {r.reused.model_calls} model and {r.reused.tool_calls} tool results without calling them again</>}.
            {r.redo && <> Redid the {r.redo}.</>}
          </p>
        </div>
        ),
      )}

      <div className={cx("mb-2 rounded-lg border transition-colors", open ? "border-rule-strong bg-raised" : "border-transparent hover:bg-wash")}>
        <button onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left">
          <div className="min-w-0 flex-1">
            <p className={cx("text-[14px] text-ink", !open && "truncate")}>
              {m?.pending ? <span className="text-shimmer">Calling {model}</span> : m?.text}
            </p>
            {step.calls.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {step.calls.map((c) => (
                  <span key={c.call_id} className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    <CallIcon state={c.state} />
                    <Mono className="text-ink-2">{c.name}</Mono>
                    {c.duration_ms != null && <span className="tnum text-faint">{ms(c.duration_ms)}</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="tnum flex shrink-0 items-center gap-4 pt-0.5 text-[12.5px] text-muted-foreground">
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
                {m.tool_calls.length > 0 && <p className="mt-2 text-[12.5px] text-muted-foreground">Asked for {m.tool_calls.map((t) => t.name).join(", ")}.</p>}
              </Block>
            )}
            {step.calls.map((c) => (
              <CallBlock key={c.call_id} call={c} />
            ))}
            <div className="mt-3 flex items-center justify-between">
              <p className="tnum text-[11.5px] text-faint">
                events {step.seqs[0]}–{step.seqs[1]}
              </p>
              <ForkHere step={step.n} />
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

function ForkHere({ step }: { step: number }) {
  const { runId } = useContext(RunCtx);
  return <ForkButton runId={runId} step={step} />;
}

function Block({ title, meta, children, tone }: { title: React.ReactNode; meta?: React.ReactNode; children: React.ReactNode; tone?: "review" }) {
  return (
    <div
      className={cx(
        "mt-3 rounded-md border first:mt-0",
        tone === "review" ? "border-[color-mix(in_oklab,var(--st-review)_40%,transparent)]" : "border-rule",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule px-3 py-2 text-[12.5px] text-muted-foreground">
        <span className="font-medium text-ink">{title}</span>
        {meta}
      </div>
      <div className="px-3 py-3">{children}</div>
    </div>
  );
}

function CallBlock({ call: c }: { call: ToolCallView }) {
  const { runId, ended } = useContext(RunCtx);
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
          <Hand className="size-3.5 text-muted-foreground" />
          {c.approval.granted_at ? (
            <>
              {c.approval.denied ? "Denied" : "Approved"} by {actor(c.approval.by)} after{" "}
              {ms(Date.parse(c.approval.granted_at) - Date.parse(c.approval.requested_at))}.
            </>
          ) : ended ? (
            <>This call needed approval and never ran.</>
          ) : (
            <>This agent needs a person to approve {c.name} before it runs.</>
          )}
        </p>
      )}
      {c.state === "in_doubt" && !ended && (
        <div className="mb-3 rounded-md bg-[color-mix(in_oklab,var(--st-review)_8%,transparent)] px-3 py-2.5 text-[13px] text-ink">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-3.5 text-st-review" />
            keel can&apos;t tell whether this call reached the tool.
          </p>
          <p className="mt-1 pl-[22px] text-ink-2">{c.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2 pl-[22px]">
            <ActionButton size="sm" variant="primary" path={`/v1/runs/${runId}/resume`} body={{ call_id: c.call_id, decision: "landed" }} done="Recorded. The run is queued again.">
              It went through, record it
            </ActionButton>
            <ActionButton size="sm" path={`/v1/runs/${runId}/resume`} body={{ call_id: c.call_id, decision: "retry" }} done="Queued. It will be sent once.">
              It didn&apos;t, send it again
            </ActionButton>
            <ActionButton size="sm" variant="ghost" path={`/v1/runs/${runId}/resume`} body={{ call_id: c.call_id, decision: "fail" }} done="Run failed.">
              Fail the run
            </ActionButton>
          </div>
        </div>
      )}
      {c.state === "awaiting_approval" && !ended && (
        <div className="mb-3 flex gap-2">
          <ActionButton size="sm" variant="primary" path={`/v1/runs/${runId}/approve`} body={{ call_id: c.call_id, approve: true }} done="Approved. The run is queued again.">
            <Check className="size-3.5" /> Approve
          </ActionButton>
          <ActionButton size="sm" path={`/v1/runs/${runId}/approve`} body={{ call_id: c.call_id, approve: false }} done="Denied. The model will be told.">
            <X className="size-3.5" /> Deny
          </ActionButton>
        </div>
      )}
      {c.child_run_id && (
        <p className="mb-3 flex items-center gap-2 text-[13px] text-ink-2">
          <CornerDownRight className="size-3.5 text-muted-foreground" />
          {c.state === "running" ? "Handed to another agent; this run waits for its answer." : "Answered by another agent."}
          <Link href={`/app/runs/${c.child_run_id}`} className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
            Open child run
          </Link>
        </p>
      )}
      {c.idempotency_key && (
        <p className="mb-3 flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <ShieldCheck className="size-3.5 text-st-completed" />
          Sent with <Mono className="text-ink-2">Idempotency-Key: {c.idempotency_key}</Mono>
        </p>
      )}
      {c.sandbox && (
        <p className="mb-3 text-[12.5px] text-muted-foreground">
          Sandbox <Mono className="text-ink-2">{c.sandbox.image}</Mono> on <Mono className="text-ink-2">{c.sandbox.runtime}</Mono>,{" "}
          {c.sandbox.warm ? "warm container" : "cold start"}, destroyed after the call.
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-[12px] text-muted-foreground">Input</p>
          <Json value={c.input} className="rounded-md bg-wash px-3 py-2" />
        </div>
        <div>
          <p className="mb-1 text-[12px] text-muted-foreground">Output</p>
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

function actor(by?: string) {
  if (!by) return "someone";
  if (by.startsWith("key:")) return `API key ${by.slice(4)}`;
  if (by.startsWith("usr:")) return by.slice(4);
  return by;
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
        <p className="text-[13px] text-muted-foreground">
          {ok ? "Finished" : "Stopped"} at <span className="tnum">{clock(ts)}</span>
        </p>
        {typeof payload.output === "string" && <p className="mt-1 font-serif text-[22px] leading-[1.25] text-ink">{payload.output}</p>}
      </div>
    </li>
  );
}

/* ---------------- replay ---------------- */

/** Step through a run one event at a time, the way a debugger steps through code. */
function Replay({ events, model }: { events: RunEvent[]; model: string }) {
  const [at, setAt] = useState(events.length); // how many events have "happened"
  const [playing, setPlaying] = useState(false);
  const n = events.length;
  const cur = Math.min(Math.max(at, 1), n);
  const view = useMemo(() => fold(events.slice(0, cur)), [events, cur]);
  const e = events[cur - 1];
  const t0 = events[0] ? Date.parse(events[0].ts) : 0;

  useEffect(() => {
    if (!playing) return;
    if (cur >= n) {
      const id = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setAt(cur + 1), 450);
    return () => clearTimeout(id);
  }, [playing, cur, n]);

  // keyboard shortcuts work anywhere on the page while replay is open, except in form fields
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const to = (k: number) => {
        ev.preventDefault();
        setPlaying(false);
        setAt(Math.min(Math.max(k, 1), n));
      };
      if (ev.key === "ArrowRight") to(cur + 1);
      else if (ev.key === "ArrowLeft") to(cur - 1);
      else if (ev.key === "Home") to(1);
      else if (ev.key === "End") to(n);
      else if (ev.key === " ") {
        ev.preventDefault();
        if (cur >= n) setAt(1);
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cur, n]);

  if (!n) return <p className="mt-6 text-[14px] text-muted-foreground">Nothing to replay yet.</p>;

  const go = (k: number) => {
    setPlaying(false);
    setAt(Math.min(Math.max(k, 1), n));
  };
  const btn = "flex size-8 items-center justify-center rounded-md border border-border text-ink-2 hover:bg-wash hover:text-foreground disabled:opacity-40";

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className={btn} onClick={() => go(1)} disabled={cur <= 1} aria-label="First event"><SkipBack className="size-3.5" /></button>
        <button className={btn} onClick={() => go(cur - 1)} disabled={cur <= 1} aria-label="Previous event"><ChevronLeft className="size-4" /></button>
        <button
          className="flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[13px] font-medium text-background"
          onClick={() => {
            if (cur >= n) setAt(1);
            setPlaying((p) => !p);
          }}
        >
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {playing ? "Pause" : cur >= n ? "Replay" : "Play"}
        </button>
        <button className={btn} onClick={() => go(cur + 1)} disabled={cur >= n} aria-label="Next event"><ChevronRight className="size-4" /></button>
        <button className={btn} onClick={() => go(n)} disabled={cur >= n} aria-label="Last event"><SkipForward className="size-3.5" /></button>
        <input
          type="range"
          min={1}
          max={n}
          value={cur}
          onChange={(ev) => go(Number(ev.target.value))}
          aria-label="Position in the event log"
          className="mx-2 min-w-[160px] flex-1 accent-[var(--foreground)]"
        />
        <span className="tnum text-[12.5px] text-muted-foreground">
          event {cur} of {n} · +{ms(Date.parse(e.ts) - t0)}
        </span>
      </div>
      <p className="mt-2 text-[12px] text-faint">Arrow keys step, space plays. Everything below is rebuilt from the first {cur} events.</p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <ol>
          {view.steps.map((s, i) => (
            <Step key={s.n} step={s} model={model} open={s.n === e.step} onToggle={() => {}} last={i === view.steps.length - 1 && !view.final} />
          ))}
          {view.final && <Final type={view.final.type} payload={view.final.payload} ts={view.ended_at!} />}
        </ol>
        <aside className="self-start rounded-lg border border-border lg:sticky lg:top-20">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <Mono className="text-[12px] text-faint">#{e.seq}</Mono>
            <Mono className="text-[13px] text-foreground">{e.type}</Mono>
            <span className="tnum ml-auto text-[12px] text-faint">{clock(e.ts)}</span>
          </div>
          <div className="max-h-[460px] overflow-auto px-4 py-3">
            <p className="mb-2 text-[12.5px] text-muted-foreground">{explain(e)}</p>
            <Json value={e.payload} />
            {e.step > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <ForkHere step={e.step} />
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function explain(e: RunEvent): string {
  const p = e.payload as Record<string, unknown>;
  switch (e.type) {
    case "run.created": return "The run was queued with its input.";
    case "run.started": return `Worker ${p.worker} took the lease and started from the beginning.`;
    case "run.resumed": return `Worker ${p.worker ?? p.to_worker} picked the run up and rebuilt its state from ${p.replayed_events} earlier events.`;
    case "model.requested": return `keel asked ${p.model ?? "the model"} for the next step.`;
    case "model.completed": return "The model answered. This response is stored, so a resume never pays for it again.";
    case "tool.started": return p.idempotency_key ? `Sent with idempotency key ${p.idempotency_key}.` : "A tool call started.";
    case "tool.completed": return p.reconciled ? "Found by asking the tool after a crash; not sent again." : "The tool returned. Its output is stored with the call id.";
    case "tool.failed": return p.in_doubt ? "keel couldn't tell whether this landed, so it stopped to ask a person." : "The tool failed and the model was told.";
    case "approval.requested": return "The run paused until a person decides.";
    case "approval.granted": return "Approved; the run was queued again.";
    case "approval.denied": return "Denied; the model was told.";
    case "handoff.started": return "Work went to another agent. This run waits without holding a worker.";
    case "handoff.completed": return "The other agent finished; its answer became the tool result.";
    case "run.completed": return "The run finished.";
    case "limit.exceeded": return "A limit ended the run at a step boundary.";
    default: return "";
  }
}

/* ---------------- raw log ---------------- */

function EventLog({ events }: { events: RunEvent[] }) {
  const [sel, setSel] = useState<number | null>(null);
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-rule bg-raised">
      <table className="w-full text-left text-[13px]">
        <thead className="text-[12px] text-muted-foreground">
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
        <td className="hidden max-w-0 truncate px-3 py-1.5 text-[12.5px] text-muted-foreground md:table-cell">{summary(e)}</td>
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
