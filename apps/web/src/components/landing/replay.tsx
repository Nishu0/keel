"use client";

import { Check, CornerDownRight, RotateCcw, ShieldCheck, Zap } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "@/lib/format";
import { EffectTag, Mono } from "../kit";

// A scripted replay of run_01JDX4K9TQ: a worker dies at step 4, the run
// resumes elsewhere, and the order still goes out exactly once.

type Row = { at: number; render: (live: boolean) => ReactNode };

const ROWS: Row[] = [
  { at: 300, render: () => <Model step={1} text="Reading the FED-DEC book before sizing anything." took="2.8s" /> },
  { at: 1100, render: () => <Call name="get_orderbook" effect="pure" took="410ms" out="bid 0.57 · ask 0.58 · 820 / 760" /> },
  { at: 1900, render: () => <Model step={2} text="Book is 52/48. Sizing the order to land near 60/40." took="3.4s" /> },
  { at: 2600, render: () => <Call name="run_python" effect="sandboxed" took="870ms" out="240" /> },
  { at: 3400, render: () => <Model step={3} text="Checking for Fed news in the last hour." took="3.5s" /> },
  { at: 4100, render: () => <Call name="web_fetch" effect="pure" took="1.2s" out="No statements since Nov 7." /> },
  { at: 4900, render: (live) => <Thinking step={4} live={live} /> },
  { at: 6600, render: () => <Crash /> },
  { at: 7900, render: () => <Resume /> },
  { at: 9100, render: () => <Model step={4} text="No news. Buying 240 YES at 0.58 to reach 60/40." took="3.7s" retry /> },
  { at: 9900, render: (live) => <Approval live={live} /> },
  { at: 11900, render: () => <Order /> },
  { at: 13000, render: () => <Done /> },
];
const LOOP = 18000;

/** The replay without any window chrome, for embedding in the app mockup. */
export function ReplayBody({ onDone }: { onDone?: (done: boolean) => void }) {
  const t = useReplayClock();
  const shown = ROWS.filter((r) => r.at <= t);
  const lastIdx = shown.length - 1;
  const done = t >= ROWS[ROWS.length - 1].at;
  useEffect(() => onDone?.(done), [done, onDone]);
  return (
    <ol className="h-[470px] overflow-hidden px-2 py-2 text-[13.5px]" aria-label="Run timeline replay">
      {shown.map((r, i) => (
        <li key={r.at} className="animate-row-in">
          {r.render(i === lastIdx && !done)}
        </li>
      ))}
    </ol>
  );
}

function useReplayClock() {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = setTimeout(() => setT(LOOP - 1), 0);
      return () => clearTimeout(id);
    }
    const start = performance.now();
    const id = setInterval(() => setT((performance.now() - start) % LOOP), 100);
    return () => clearInterval(id);
  }, []);
  return t;
}

export function Replay() {
  const [t, setT] = useState(0);

  useEffect(() => {
    // reduced motion: jump straight to the finished run
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = setTimeout(() => setT(LOOP - 1), 0);
      return () => clearTimeout(id);
    }
    const start = performance.now();
    const id = setInterval(() => setT((performance.now() - start) % LOOP), 100);
    return () => clearInterval(id);
  }, []);

  const now = t;
  const shown = ROWS.filter((r) => r.at <= now);
  const lastIdx = shown.length - 1;
  const done = now >= ROWS[ROWS.length - 1].at;

  return (
    <div className="overflow-hidden rounded-lg border border-rule-strong bg-raised shadow-[0_1px_0_var(--rule),0_24px_60px_-28px_rgb(0_0_0/0.28)]">
      <div className="flex items-center gap-3 border-b border-rule px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <i className="size-2.5 rounded-full bg-rule-strong" />
          <i className="size-2.5 rounded-full bg-rule-strong" />
          <i className="size-2.5 rounded-full bg-rule-strong" />
        </span>
        <Mono className="text-muted-foreground">run_01JDX4K9TQ</Mono>
        <span className="text-[13px] text-muted-foreground">trading-agent v7</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
          <i
            className={cx("size-2 rounded-full", !done && "animate-pulse-dot")}
            style={{ background: done ? "var(--st-completed)" : "var(--st-running)" }}
          />
          {done ? "Completed" : "Running"}
        </span>
      </div>
      <ol className="h-[486px] overflow-hidden px-2 py-2 text-[13.5px]" aria-label="Run timeline replay">
        {shown.map((r, i) => (
          <li key={r.at} className="animate-row-in">
            {r.render(i === lastIdx && !done)}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Line({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex min-h-8 items-center gap-2.5 rounded-md px-2.5", className)}>{children}</div>;
}

function StepNo({ n }: { n: number }) {
  return <span className="tnum w-5 shrink-0 text-right text-[12px] text-faint">{n}</span>;
}

function Model({ step, text, took, retry }: { step: number; text: string; took: string; retry?: boolean }) {
  return (
    <Line>
      <StepNo n={step} />
      <span className="truncate text-ink">{text}</span>
      {retry && <span className="shrink-0 text-[12px] text-muted-foreground">attempt 2</span>}
      <span className="tnum ml-auto shrink-0 text-[12px] text-faint">{took}</span>
    </Line>
  );
}

function Call({ name, effect, took, out }: { name: string; effect: "pure" | "sandboxed" | "external"; took: string; out: string }) {
  return (
    <Line>
      <span className="w-5 shrink-0" />
      <CornerDownRight className="size-3.5 shrink-0 text-faint" />
      <Mono className="shrink-0 text-ink-2">{name}</Mono>
      <EffectTag effect={effect} />
      <span className="truncate text-[12.5px] text-muted-foreground">{out}</span>
      <Check className="ml-auto size-3.5 shrink-0 text-st-completed" />
      <span className="tnum w-11 shrink-0 text-right text-[12px] text-faint">{took}</span>
    </Line>
  );
}

function Thinking({ step, live }: { step: number; live: boolean }) {
  return (
    <Line>
      <StepNo n={step} />
      <span className={live ? "text-shimmer" : "text-faint line-through decoration-rule-strong"}>Calling claude-sonnet-5-5</span>
    </Line>
  );
}

function Crash() {
  return (
    <Line className="my-1 bg-[color-mix(in_oklab,var(--st-failed)_8%,transparent)]">
      <Zap className="ml-1.5 size-3.5 shrink-0 text-st-failed" />
      <span className="text-ink">
        Worker <Mono>w-2</Mono> was killed. Its lease ran out 20s later.
      </span>
    </Line>
  );
}

function Resume() {
  return (
    <Line className="mb-1 bg-wash">
      <RotateCcw className="ml-1.5 size-3.5 shrink-0 text-st-running" />
      <span className="text-ink">
        Resumed on <Mono>w-3</Mono>. Replayed 15 events, reused 3 model and 3 tool results.
      </span>
    </Line>
  );
}

function Approval({ live }: { live: boolean }) {
  return (
    <Line>
      <span className="w-5 shrink-0" />
      <CornerDownRight className="size-3.5 shrink-0 text-faint" />
      <Mono className="shrink-0 text-ink-2">place_order</Mono>
      <EffectTag effect="external" />
      {live ? (
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-st-review">
          <i className="size-1.5 animate-pulse-dot rounded-full bg-st-review" />
          Waiting for approval
        </span>
      ) : (
        <span className="text-[12.5px] text-muted-foreground">Approved by Ana Ruiz</span>
      )}
    </Line>
  );
}

function Order() {
  return (
    <Line>
      <span className="w-5 shrink-0" />
      <span className="w-3.5 shrink-0" />
      <ShieldCheck className="size-3.5 shrink-0 text-st-completed" />
      <span className="truncate text-[12.5px] text-ink-2">
        Filled 240 at 0.58. Sent once, with <Mono>Idempotency-Key: tc_4be81f</Mono>
      </span>
      <span className="tnum ml-auto w-11 shrink-0 text-right text-[12px] text-faint">740ms</span>
    </Line>
  );
}

function Done() {
  return (
    <div className="mx-2.5 mt-3 border-t border-rule pt-3">
      <p className="text-ink">Bought 240 YES at 0.58 on FED-DEC. Book is now 61/39.</p>
      <p className="tnum mt-1 text-[12.5px] text-muted-foreground">6 steps · 52.1k tokens · $0.21 · 1m 34s</p>
    </div>
  );
}
