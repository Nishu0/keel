import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { UsageChart, type Day, type Series } from "@/components/app/usage-chart";
import { tokens, usd } from "@/lib/format";
import { agents } from "@/lib/mock";

export const metadata: Metadata = { title: "Usage" };

const PALETTE: [string, string][] = [
  ["#2a78d6", "#3987e5"],
  ["#eb6834", "#d95926"],
  ["#1baf7a", "#199e70"],
  ["#eda100", "#c98500"],
];

const series: Series[] = agents.map((a, i) => ({ id: a.id, name: a.name, light: PALETTE[i][0], dark: PALETTE[i][1] }));

// deterministic stand-in numbers until /usage is wired up
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const r = rng(42);
const base: Record<string, number> = { agt_trader: 2.2, agt_research: 7.5, agt_triage: 0.6, agt_release: 0.4 };
const days: Day[] = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 10, 11 + i));
  const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
  return {
    date: d.toISOString().slice(0, 10),
    values: Object.fromEntries(
      agents.map((a) => [a.id, +(base[a.id] * (weekend ? 0.35 : 0.6 + r() * 0.9) * (a.id === "agt_research" && i === 13 ? 2.1 : 1)).toFixed(2)]),
    ),
  };
});

const month = { cost: 214.38, input: 31_420_000, output: 1_380_000, sandbox_min: 412, runs: 1_284 };
const limits = { sandbox_min: 1000, concurrent: 20 };

export default function UsagePage() {
  return (
    <>
      <PageHeader title="Usage" sub="November so far. Billed on the 1st." />
      <div className="space-y-8 px-6 py-6 lg:px-10">
        <dl className="grid gap-px overflow-hidden rounded-lg border border-rule-strong bg-rule sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Spend" value={usd(month.cost)} note="Model tokens at keel rates plus sandbox time" />
          <Stat label="Tokens" value={tokens(month.input + month.output)} note={`${tokens(month.input)} in, ${tokens(month.output)} out`} />
          <Stat label="Sandbox minutes" value={`${month.sandbox_min}`} note={`of ${limits.sandbox_min} on Pro`} meter={month.sandbox_min / limits.sandbox_min} />
          <Stat label="Runs" value={month.runs.toLocaleString("en-US")} note={`Up to ${limits.concurrent} at a time`} />
        </dl>
        <UsageChart series={series} days={days} />
        <p className="max-w-[70ch] text-[13px] text-muted">
          The jump today is research-agent: a long Fed statement summary ran until it hit its 80 step limit. Set a lower token budget on the agent to cap
          runs like that.
        </p>
      </div>
    </>
  );
}

function Stat({ label, value, note, meter }: { label: string; value: string; note: string; meter?: number }) {
  return (
    <div className="bg-raised px-5 py-4">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="tnum mt-1.5 font-serif text-[34px] leading-none text-ink">{value}</dd>
      {meter != null && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-wash" role="meter" aria-valuenow={Math.round(meter * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} used`}>
          <div className="h-full rounded-full bg-ink" style={{ width: `${meter * 100}%` }} />
        </div>
      )}
      <p className="mt-2 text-[12.5px] text-muted">{note}</p>
    </div>
  );
}
