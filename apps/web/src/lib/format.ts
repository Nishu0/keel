import type { RunStatus } from "./types";

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

export function ms(d: number | null | undefined): string {
  if (d == null) return "–";
  if (d < 1000) return `${d}ms`;
  const s = d / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  if (m < 60) return `${m}m ${r.toString().padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${(m % 60).toString().padStart(2, "0")}m`;
}

export const tokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

export const usd = (n: number) => (n === 0 ? "$0" : n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`);

// fixed reference "now" so server and client render the same relative times
export const NOW = Date.parse("2026-11-24T07:56:00Z");

export function ago(isoTs: string, now: number = NOW): string {
  const s = Math.max(0, Math.round((now - Date.parse(isoTs)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const clock = (isoTs: string) => new Date(isoTs).toISOString().slice(11, 19);

export const statusLabel: Record<RunStatus, string> = {
  queued: "Queued",
  running: "Running",
  waiting: "Waiting on child",
  waiting_for_approval: "Needs approval",
  needs_review: "Needs review",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const statusColor: Record<RunStatus, string> = {
  queued: "var(--st-queued)",
  running: "var(--st-running)",
  waiting: "var(--st-waiting)",
  waiting_for_approval: "var(--st-review)",
  needs_review: "var(--st-review)",
  completed: "var(--st-completed)",
  failed: "var(--st-failed)",
  cancelled: "var(--st-cancelled)",
};

export const isLive = (s: RunStatus) => s === "running" || s === "waiting";
