"use client";

import { Check } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { tokens } from "@/lib/format";
import { useApi } from "@/lib/live";
import { useMe } from "@/lib/me";
import { Button } from "../kit";

type Limits = { concurrent_runs: number; runs_per_month: number; tokens_per_month: number; sandbox_minutes: number; seats: number | null; keel_models: boolean };
type BillingData = {
  plan: "free" | "pro" | "team";
  limits: Limits;
  usage: { runs: number; tokens: number; cost_usd: number; active_runs: number; members: number };
  plans: Record<string, Limits>;
  stripe: boolean;
  has_billing_account: boolean;
};

const PRICE: Record<string, string> = { free: "$0", pro: "$40", team: "Talk to us" };
const BLURB: Record<string, string> = {
  free: "For trying it on a real agent.",
  pro: "For a small team shipping agents.",
  team: "For agents your company depends on.",
};

const DEMO: BillingData = {
  plan: "pro",
  limits: { concurrent_runs: 20, runs_per_month: 20000, tokens_per_month: 100_000_000, sandbox_minutes: 1000, seats: 5, keel_models: true },
  usage: { runs: 1284, tokens: 32_800_000, cost_usd: 214.38, active_runs: 3, members: 4 },
  plans: {
    free: { concurrent_runs: 2, runs_per_month: 500, tokens_per_month: 2_000_000, sandbox_minutes: 60, seats: 1, keel_models: false },
    pro: { concurrent_runs: 20, runs_per_month: 20000, tokens_per_month: 100_000_000, sandbox_minutes: 1000, seats: 5, keel_models: true },
    team: { concurrent_runs: 100, runs_per_month: 200000, tokens_per_month: 1_000_000_000, sandbox_minutes: 10000, seats: null, keel_models: true },
  },
  stripe: false,
  has_billing_account: false,
};

function Meter({ label, used, max, fmt = (n: number) => n.toLocaleString("en-US") }: { label: string; used: number; max: number | null; fmt?: (n: number) => string }) {
  const pct = max ? Math.min(100, (used / max) * 100) : 0;
  return (
    <div className="px-5 py-4">
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tnum text-ink-2">
          {fmt(used)} <span className="text-faint">/ {max == null ? "unlimited" : fmt(max)}</span>
        </span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-wash" role="meter" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 90 ? "var(--st-review)" : "var(--foreground)" }} />
      </div>
    </div>
  );
}

export function BillingLive() {
  const api = useApi<BillingData>("/v1/billing");
  const me = useMe();
  const params = useSearchParams();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const data = api.live === false ? DEMO : api.data;
  const owner = api.live === false || me.role === "owner";

  if (!data) return <div className="h-64 animate-pulse rounded-xl border border-border" />;

  const go = async (path: string, body?: unknown, key = path) => {
    if (api.live === false) return setProblem("This is demo data. Connect the api and Stripe to change plans.");
    setBusy(key);
    setProblem(null);
    const r = await fetch(`/api/keel${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    const out = r ? await r.json().catch(() => ({})) : {};
    setBusy(null);
    if (r?.ok && out.url) window.location.assign(out.url);
    else setProblem(out.detail ?? "Couldn't reach billing.");
  };

  const u = data.usage;
  return (
    <div className="space-y-10">
      {params.get("upgraded") && (
        <p className="rounded-lg border border-[color-mix(in_oklab,var(--st-completed)_40%,transparent)] px-4 py-3 text-[14px] text-foreground">
          Thanks. Your plan updates as soon as Stripe confirms the payment, usually within a few seconds.
        </p>
      )}

      <section>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <p className="text-[13px] text-muted-foreground">Current plan</p>
            <p className="stat-num mt-1 text-[40px] capitalize leading-none">{data.plan}</p>
          </div>
          {owner && data.has_billing_account && (
            <Button onClick={() => go("/v1/billing/portal")} disabled={busy !== null}>
              {busy === "/v1/billing/portal" ? "Opening" : "Manage billing"}
            </Button>
          )}
        </div>
        <div className="mt-5 grid divide-y divide-border overflow-hidden rounded-xl border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Meter label="Runs this month" used={u.runs} max={data.limits.runs_per_month} />
          <Meter label="Tokens this month" used={u.tokens} max={data.limits.tokens_per_month} fmt={tokens} />
          <Meter label="Seats" used={u.members} max={data.limits.seats} />
        </div>
        <p className="tnum mt-3 text-[13px] text-muted-foreground">
          {u.active_runs} running now, up to {data.limits.concurrent_runs} at a time on this plan.
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-[14px] font-medium text-foreground">Plans</h2>
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
          {(["free", "pro", "team"] as const).map((p) => {
            const l = data.plans[p];
            const current = p === data.plan;
            return (
              <div key={p} className={`flex flex-col bg-background p-6 ${current ? "bg-white/[0.025]" : ""}`}>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[15px] font-medium capitalize text-foreground">{p}</h3>
                  {current && <span className="text-[12.5px] text-muted-foreground">Current</span>}
                </div>
                <p className="stat-num mt-4 text-[36px] leading-none">
                  {PRICE[p]}
                  {PRICE[p].startsWith("$") && <span className="ml-1 text-[14px] font-normal text-muted-foreground">/ month</span>}
                </p>
                <p className="mt-2 text-[13.5px] text-muted-foreground">{BLURB[p]}</p>
                <ul className="mt-6 space-y-2 text-[14px] text-ink-2">
                  {[
                    `${l.seats == null ? "Unlimited" : l.seats} member${l.seats === 1 ? "" : "s"}`,
                    `${l.concurrent_runs} runs at a time`,
                    `${l.runs_per_month.toLocaleString("en-US")} runs a month`,
                    `${tokens(l.tokens_per_month)} tokens a month`,
                    `${l.sandbox_minutes.toLocaleString("en-US")} sandbox minutes`,
                    l.keel_models ? "keel model access, or your own key" : "Bring your own model key",
                  ].map((x) => (
                    <li key={x} className="flex gap-2.5">
                      <Check className="mt-[3px] size-3.5 shrink-0" />
                      {x}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-7">
                  {current || p === "free" ? (
                    <Button className="w-full" disabled>{current ? "Your plan" : "Included"}</Button>
                  ) : p === "team" ? (
                    <a href="mailto:sales@keel.run" className="inline-flex h-9 w-full items-center justify-center rounded-md border border-border text-[13.5px] text-foreground hover:bg-wash">
                      Contact us
                    </a>
                  ) : (
                    <Button variant="primary" className="w-full" disabled={!owner || busy !== null} onClick={() => go("/v1/billing/checkout", { plan: p }, p)}>
                      {busy === p ? "Opening checkout" : owner ? `Upgrade to ${p}` : "Ask an owner to upgrade"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {problem && <p role="alert" className="mt-3 text-[13.5px] text-st-failed">{problem}</p>}
        {api.live && !data.stripe && <p className="mt-3 text-[13px] text-muted-foreground">Stripe isn&apos;t configured on this server yet, so upgrades are off.</p>}
      </section>
    </div>
  );
}
