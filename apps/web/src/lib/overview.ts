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

export type Stats = {
  runsWeek: number;
  runsDelta: number;
  spendWeek: number;
  spendDelta: number;
  successWeek: number;
  successPrev: number;
  attention: number;
  live: number;
};

export const stats: Stats = {
  runsWeek: sum(last7, "completed") + sum(last7, "failed"),
  runsDelta: (sum(last7, "completed") + sum(last7, "failed")) / (sum(prev7, "completed") + sum(prev7, "failed")) - 1,
  spendWeek: sum(last7, "cost"),
  spendDelta: sum(last7, "cost") / sum(prev7, "cost") - 1,
  successWeek: sum(last7, "completed") / (sum(last7, "completed") + sum(last7, "failed")),
  successPrev: sum(prev7, "completed") / (sum(prev7, "completed") + sum(prev7, "failed")),
  attention: runs.filter((x) => x.status === "needs_review" || x.status === "waiting_for_approval").length,
  live: runs.filter((x) => x.status === "running" || x.status === "waiting").length,
};

// ---------- live: the same shapes, computed from api runs ----------

type LiveRun = { id: string; status: string; usage: { cost_usd: number } };

const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** ulid style ids start with 10 crockford base32 characters of ms time */
export function idTime(id: string): number {
  let ms = 0;
  for (const ch of id.split("_")[1]?.slice(0, 10) ?? "") ms = ms * 32 + Math.max(0, A.indexOf(ch));
  return ms;
}

export function fromRuns(list: LiveRun[], now: number): { stats: Stats; daily: DayStat[] } {
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  const byDay = new Map<string, DayStat>();
  for (let i = 89; i >= 0; i--) {
    const d = day(now - i * 86_400_000);
    byDay.set(d, { date: d, completed: 0, failed: 0, cost: 0 });
  }
  for (const r of list) {
    const b = byDay.get(day(idTime(r.id)));
    if (!b) continue;
    if (r.status === "completed") b.completed++;
    if (r.status === "failed" || r.status === "cancelled") b.failed++;
    b.cost += r.usage.cost_usd;
  }
  const daily = [...byDay.values()];
  const week = (from: number, to: number) => list.filter((r) => idTime(r.id) > now - from * 86_400_000 && idTime(r.id) <= now - to * 86_400_000);
  const cur = week(7, 0);
  const prev = week(14, 7);
  const rate = (xs: LiveRun[]) => {
    const done = xs.filter((r) => ["completed", "failed", "cancelled"].includes(r.status));
    return done.length ? done.filter((r) => r.status === "completed").length / done.length : 1;
  };
  const cost = (xs: LiveRun[]) => xs.reduce((s, r) => s + r.usage.cost_usd, 0);
  const delta = (a: number, b: number) => (b ? a / b - 1 : 0);
  return {
    daily,
    stats: {
      runsWeek: cur.length,
      runsDelta: delta(cur.length, prev.length),
      spendWeek: cost(cur),
      spendDelta: delta(cost(cur), cost(prev)),
      successWeek: rate(cur),
      successPrev: rate(prev),
      attention: list.filter((r) => r.status === "needs_review" || r.status === "waiting_for_approval").length,
      live: list.filter((r) => r.status === "running" || r.status === "waiting").length,
    },
  };
}
