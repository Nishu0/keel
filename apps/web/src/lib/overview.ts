import { runs } from "./mock";

// 90 days of daily run outcomes for the overview chart. Deterministic stand
// in data, shaped like what /v1/usage will return per day.

export type DayStat = { date: string; completed: number; failed: number; cost: number };

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const END = Date.UTC(2026, 10, 24);
const r = rng(7);

export const daily: DayStat[] = Array.from({ length: 90 }, (_, i) => {
  const d = new Date(END - (89 - i) * 86_400_000);
  const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
  const growth = 0.55 + (i / 89) * 0.65; // usage has been climbing
  const base = (weekend ? 18 : 46) * growth;
  const completed = Math.round(base * (0.8 + r() * 0.45));
  const failed = Math.round(completed * (0.03 + r() * 0.05));
  return { date: d.toISOString().slice(0, 10), completed, failed, cost: +(completed * (0.09 + r() * 0.06)).toFixed(2) };
});

function sum(days: DayStat[], k: "completed" | "failed" | "cost") {
  return days.reduce((s, d) => s + d[k], 0);
}

const last7 = daily.slice(-7);
const prev7 = daily.slice(-14, -7);

export const stats = {
  runsWeek: sum(last7, "completed") + sum(last7, "failed"),
  runsDelta: (sum(last7, "completed") + sum(last7, "failed")) / (sum(prev7, "completed") + sum(prev7, "failed")) - 1,
  spendWeek: sum(last7, "cost"),
  spendDelta: sum(last7, "cost") / sum(prev7, "cost") - 1,
  successWeek: sum(last7, "completed") / (sum(last7, "completed") + sum(last7, "failed")),
  successPrev: sum(prev7, "completed") / (sum(prev7, "completed") + sum(prev7, "failed")),
  attention: runs.filter((x) => x.status === "needs_review" || x.status === "waiting_for_approval").length,
  live: runs.filter((x) => x.status === "running" || x.status === "waiting").length,
};
