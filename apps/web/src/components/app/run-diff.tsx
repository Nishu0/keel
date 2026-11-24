"use client";

import { ArrowRight, Check, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fold, type RunView, type StepView } from "@/lib/fold";
import { cx, tokens, usd } from "@/lib/format";
import { eventsByRun } from "@/lib/mock";
import type { RunEvent } from "@/lib/types";
import { Mono } from "../kit";
import { Json } from "./json";

async function loadEvents(id: string): Promise<RunEvent[] | null> {
  if (eventsByRun[id]) return eventsByRun[id];
  const r = await fetch(`/api/keel/v1/runs/${encodeURIComponent(id)}/events?limit=5000`, { cache: "no-store" }).catch(() => null);
  return r?.ok ? ((await r.json()) as RunEvent[]) : null;
}

type Side = { id: string; events: RunEvent[]; view: RunView } | null;

function totals(v: RunView) {
  let tok = 0;
  let cost = 0;
  for (const s of v.steps) {
    tok += (s.model?.usage?.input ?? 0) + (s.model?.usage?.output ?? 0);
    cost += s.model?.cost_usd ?? 0;
  }
  const out = v.final?.payload?.output;
  return { steps: v.steps.length, tok, cost, output: typeof out === "string" ? out : null, ended: v.final?.type ?? "running" };
}

/** What a step did, reduced to something comparable across two runs. */
function signature(s: StepView | undefined): string {
  if (!s) return "";
  return JSON.stringify({ text: s.model?.text ?? "", calls: s.calls.map((c) => [c.name, c.input, c.output ?? null]) });
}

export function RunDiff({ a, b }: { a: string; b: string }) {
  const [left, setLeft] = useState<Side>(null);
  const [right, setRight] = useState<Side>(null);
  const [missing, setMissing] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([loadEvents(a), loadEvents(b)]).then(([ea, eb]) => {
      if (!alive) return;
      if (!ea || !eb) return setMissing(!ea ? a : b);
      setLeft({ id: a, events: ea, view: fold(ea) });
      setRight({ id: b, events: eb, view: fold(eb) });
    });
    return () => {
      alive = false;
    };
  }, [a, b]);

  const rows = useMemo(() => {
    if (!left || !right) return [];
    const n = Math.max(left.view.steps.length, right.view.steps.length);
    return Array.from({ length: n }, (_, i) => {
      const l = left.view.steps.find((s) => s.n === i + 1);
      const r = right.view.steps.find((s) => s.n === i + 1);
      return { n: i + 1, l, r, same: signature(l) === signature(r) };
    });
  }, [left, right]);

  if (missing) return <p className="text-[14px] text-muted-foreground">Couldn&apos;t load {missing}. It may be in another org or not exist.</p>;
  if (!left || !right) return <div className="h-64 animate-pulse rounded-xl border border-border" />;

  const tl = totals(left.view);
  const tr = totals(right.view);
  const firstDiff = rows.find((r) => !r.same)?.n;
  const delta = (x: number, y: number, f: (n: number) => string) => {
    const d = y - x;
    if (Math.abs(d) < 1e-9) return <span className="text-faint">same</span>;
    return <span className={d < 0 ? "text-st-completed" : "text-st-review"}>{d > 0 ? "+" : "-"}{f(Math.abs(d))}</span>;
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
        {[
          ["Steps", String(tl.steps), String(tr.steps), delta(tl.steps, tr.steps, String)],
          ["Tokens", tokens(tl.tok), tokens(tr.tok), delta(tl.tok, tr.tok, tokens)],
          ["Cost", usd(tl.cost), usd(tr.cost), delta(tl.cost, tr.cost, usd)],
          ["Ended", tl.ended.replace("run.", ""), tr.ended.replace("run.", ""), null],
        ].map(([k, x, y, d]) => (
          <div key={k as string} className="bg-background px-5 py-4">
            <p className="text-[13px] text-muted-foreground">{k}</p>
            <p className="stat-num mt-1 flex items-center gap-2 text-[22px]">
              {x} <ArrowRight className="size-4 text-faint" /> {y}
            </p>
            {d && <p className="tnum mt-1 text-[12.5px]">{d}</p>}
          </div>
        ))}
      </div>

      <p className="text-[14px] text-ink-2">
        {firstDiff ? (
          <>The runs agree up to step {firstDiff - 1 || "none"} and first differ at <span className="text-foreground">step {firstDiff}</span>.</>
        ) : (
          <>Every step matches.</>
        )}
      </p>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[48px_minmax(0,1fr)_minmax(0,1fr)] border-b border-border text-[12.5px] text-muted-foreground">
          <span className="px-3 py-2">Step</span>
          <Link href={`/app/runs/${a}`} className="truncate border-l border-border px-4 py-2 font-mono hover:text-foreground">{a}</Link>
          <Link href={`/app/runs/${b}`} className="truncate border-l border-border px-4 py-2 font-mono hover:text-foreground">{b}</Link>
        </div>
        {rows.map((row) => (
          <div key={row.n} className={cx("grid grid-cols-[48px_minmax(0,1fr)_minmax(0,1fr)] border-b border-border last:border-0", !row.same && "bg-[color-mix(in_oklab,var(--st-review)_5%,transparent)]")}>
            <span className="tnum flex items-start gap-1 px-3 py-3 text-[12.5px] text-faint">
              {row.n}
              {row.same ? <Check className="mt-0.5 size-3 text-st-completed" /> : <X className="mt-0.5 size-3 text-st-review" />}
            </span>
            <Cell s={row.l} other={row.r} />
            <Cell s={row.r} other={row.l} />
          </div>
        ))}
      </div>

      {(tl.output || tr.output) && (
        <div className="grid gap-4 md:grid-cols-2">
          {[tl.output, tr.output].map((o, i) => (
            <div key={i} className="rounded-xl border border-border p-4">
              <p className="text-[12.5px] text-muted-foreground">Final answer</p>
              <p className="mt-2 font-serif text-[20px] leading-[1.3] text-foreground">{o ?? "No answer yet"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Cell({ s, other }: { s: StepView | undefined; other: StepView | undefined }) {
  if (!s) return <div className="border-l border-border px-4 py-3 text-[13px] text-faint">No step here</div>;
  const textDiffers = (s.model?.text ?? "") !== (other?.model?.text ?? "");
  return (
    <div className="min-w-0 border-l border-border px-4 py-3">
      <p className={cx("text-[14px]", textDiffers ? "text-foreground" : "text-ink-2")}>{s.model?.text || <span className="text-faint">Thinking</span>}</p>
      {s.calls.map((c) => {
        const twin = other?.calls.find((x) => x.name === c.name);
        const changed = !twin || JSON.stringify(twin.output ?? null) !== JSON.stringify(c.output ?? null) || JSON.stringify(twin.input) !== JSON.stringify(c.input);
        return (
          <details key={c.call_id} className="mt-2">
            <summary className="cursor-pointer text-[12.5px] text-muted-foreground">
              <Mono className="text-ink-2">{c.name}</Mono> {changed && <span className="text-st-review">differs</span>}
            </summary>
            <Json value={{ input: c.input, output: c.output ?? null }} className="mt-1 rounded-md bg-wash px-3 py-2" />
          </details>
        );
      })}
    </div>
  );
}
