"use client";

import { useEffect, useState, type ReactNode } from "react";
import { tokens, usd } from "@/lib/format";
import { UsageChart, type Day, type Series } from "./usage-chart";

const PALETTE: [string, string][] = [
  ["#2a78d6", "#3987e5"],
  ["#eb6834", "#d95926"],
  ["#1baf7a", "#199e70"],
  ["#eda100", "#c98500"],
];

type ApiUsage = {
  totals: { input_tokens: number; output_tokens: number; cost_usd: number; runs: number };
  days: { date: string; agents: Record<string, { cost_usd: number }> }[];
};

/** Shows live usage when the api is connected, otherwise the demo view passed as children. */
export function UsageLive({ children }: { children: ReactNode }) {
  const [data, setData] = useState<{ usage: ApiUsage; names: Record<string, string> } | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/keel/v1/usage"), fetch("/api/keel/v1/agents")])
      .then(async ([u, a]) => {
        if (!u.ok || !a.ok) return;
        const agents = (await a.json()) as { id: string; name: string }[];
        setData({ usage: (await u.json()) as ApiUsage, names: Object.fromEntries(agents.map((x) => [x.id, x.name])) });
      })
      .catch(() => {});
  }, []);

  if (!data) return <>{children}</>;
  const { usage, names } = data;
  if (usage.totals.runs === 0) {
    return (
      <div className="rounded-lg border border-dashed border-rule-strong px-6 py-14 text-center">
        <p className="font-serif text-[24px] text-ink">No usage yet this month.</p>
        <p className="mt-2 text-[14px] text-muted-foreground">Start a run and its tokens and cost show up here.</p>
      </div>
    );
  }

  // the four agents with the most spend get their own color; the rest fold into "Other"
  const spend: Record<string, number> = {};
  for (const d of usage.days) for (const [id, v] of Object.entries(d.agents)) spend[id] = (spend[id] ?? 0) + v.cost_usd;
  const ranked = Object.keys(spend).sort((x, y) => spend[y] - spend[x] || x.localeCompare(y));
  const top = ranked.slice(0, ranked.length > 4 ? 3 : 4);
  const series: Series[] = top.map((id, i) => ({ id, name: names[id] ?? id, light: PALETTE[i][0], dark: PALETTE[i][1] }));
  if (ranked.length > top.length) series.push({ id: "other", name: "Other", light: "#8a8a85", dark: "#6b6b67" });
  const days: Day[] = usage.days.map((d) => {
    const values: Record<string, number> = {};
    for (const [id, v] of Object.entries(d.agents)) {
      const key = top.includes(id) ? id : "other";
      values[key] = (values[key] ?? 0) + v.cost_usd;
    }
    return { date: d.date, values };
  });

  const t = usage.totals;
  return (
    <>
      <dl className="grid gap-px overflow-hidden rounded-lg border border-rule-strong bg-rule sm:grid-cols-3">
        {[
          ["Spend", usd(t.cost_usd)],
          ["Tokens", tokens(t.input_tokens + t.output_tokens)],
          ["Runs", t.runs.toLocaleString("en-US")],
        ].map(([k, v]) => (
          <div key={k} className="bg-raised px-5 py-4">
            <dt className="text-[13px] text-muted-foreground">{k}</dt>
            <dd className="stat-num mt-1.5 text-[32px] leading-none text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <UsageChart series={series} days={days} />
    </>
  );
}
