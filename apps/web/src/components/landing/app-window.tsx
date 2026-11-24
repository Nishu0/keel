"use client";

import { Activity, Bot, Ellipsis, Minus, PanelLeft, Plus, ScanSearch, Search, SquarePen } from "lucide-react";
import { useState } from "react";
import { cx } from "@/lib/format";
import { Mark, Mono } from "../kit";
import { ReplayBody } from "./replay";

const RUNS = [
  { name: "trading-agent", line: "Running", tone: "var(--st-running)", when: "now", active: true },
  { name: "inbox-triage", line: "Needs approval", tone: "var(--st-review)", when: "3m" },
  { name: "research-agent", line: "Running · 14 steps", tone: "var(--st-running)", when: "6m" },
  { name: "release-notes", line: "Completed", tone: "var(--st-completed)", when: "3h" },
  { name: "trading-agent", line: "Needs review", tone: "var(--st-review)", when: "37m" },
];

/** A still of the app, with the live replay in the main pane. Decorative: it's a picture of the product. */
export function AppWindow() {
  const [done, setDone] = useState(false);
  return (
    <div className="overflow-hidden rounded-t-2xl border border-b-0 border-white/10 bg-background shadow-[0_-30px_120px_-40px_rgb(0_0_0/0.9)]">
      <div className="grid md:grid-cols-[300px_minmax(0,1fr)]">
        {/* sidebar */}
        <aside className="hidden border-r border-white/[0.07] bg-background p-3 md:block">
          <div className="flex items-center gap-2">
            <PanelLeft className="size-4 text-muted-foreground" />
            <div className="flex h-9 flex-1 items-center gap-2 rounded-lg bg-white/[0.06] px-3 text-[14px] text-muted-foreground">
              <Search className="size-3.5" />
              <span className="flex-1">Search</span>
              <kbd className="rounded bg-white/10 px-1.5 text-[11px]">⌘</kbd>
              <kbd className="rounded bg-white/10 px-1.5 text-[11px]">K</kbd>
            </div>
          </div>
          <nav className="mt-4 space-y-0.5 text-[15px]">
            {[
              [SquarePen, "New run"],
              [Activity, "Runs", true],
              [Bot, "Agents"],
              [Ellipsis, "More"],
            ].map(([Icon, label, on]) => {
              const I = Icon as typeof SquarePen;
              return (
                <div
                  key={label as string}
                  className={cx("flex h-9 items-center gap-3 rounded-lg px-2.5", on ? "bg-white/[0.07] text-foreground" : "text-ink-2")}
                >
                  <I className="size-4 text-muted-foreground" strokeWidth={1.7} />
                  {label as string}
                </div>
              );
            })}
          </nav>
          <p className="mb-2 mt-6 px-2.5 text-[13px] text-muted-foreground">Recent runs</p>
          <ul className="space-y-1">
            {RUNS.map((r, i) => (
              <li key={i} className={cx("flex items-start gap-3 rounded-lg px-2.5 py-2", r.active && "bg-white/[0.04]")}>
                <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
                  <i className={cx("size-2 rounded-full", r.tone.includes("running") && "animate-pulse-dot")} style={{ background: r.tone }} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] text-foreground">{r.name}</span>
                  <span className="block text-[13px]" style={{ color: r.line.startsWith("Needs") ? r.tone : undefined }}>
                    <span className={r.line.startsWith("Needs") ? "" : "text-muted-foreground"}>{r.line}</span>
                    <span className="text-faint"> · {r.when}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </aside>

        {/* main pane */}
        <div className="min-w-0">
          <div className="flex h-[52px] items-center border-b border-white/[0.07] px-4">
            <div className="w-24" />
            <div className="mx-auto flex items-center gap-2.5 text-[15px] text-foreground">
              <Mark className="size-6" />
              <Mono className="text-[13px]">run_01JDX4K9TQ</Mono>
              <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <i
                  className={cx("size-1.5 rounded-full", !done && "animate-pulse-dot")}
                  style={{ background: done ? "var(--st-completed)" : "var(--st-running)" }}
                />
                {done ? "Completed" : "Running"}
              </span>
            </div>
            <div className="flex w-24 items-center justify-end gap-3 text-muted-foreground">
              <Minus className="size-4" />
              <Plus className="size-4" />
              <ScanSearch className="size-4" />
            </div>
          </div>
          <div
            className="bg-[radial-gradient(circle,rgb(255_255_255/0.07)_1px,transparent_1.2px)] [background-size:18px_18px]"
          >
            <div className="mx-auto max-w-[760px] py-3">
              <ReplayBody onDone={setDone} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
