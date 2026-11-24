import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CodeWindow, RunSnippet, ToolSnippet } from "@/components/landing/code";
import { Dither } from "@/components/landing/dither";
import { Nav } from "@/components/landing/nav";
import { Replay } from "@/components/landing/replay";
import { ButtonLink, EffectTag, Mono, Wordmark } from "@/components/ui";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        <Breaks />
        <Effects />
        <Viewer />
        <SelfHost />
        <Pricing />
        <Closing />
      </main>
      <Footer />
    </>
  );
}

function Wrap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-[1160px] px-5 sm:px-8 ${className}`}>{children}</div>;
}

function H2({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="max-w-[18ch] scroll-mt-24 font-serif text-[40px] leading-[1.04] text-ink sm:text-[52px]">
      {children}
    </h2>
  );
}

/* ---------------- hero ---------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <Dither className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] w-full opacity-[0.13]" />
      <Wrap className="relative grid gap-12 pb-24 pt-16 sm:pt-24 lg:grid-cols-[1fr_1.08fr] lg:gap-14 lg:pb-32">
        <div className="flex flex-col justify-center">
          <h1 className="font-serif text-[52px] leading-[0.98] tracking-[-0.015em] text-ink sm:text-[72px] lg:text-[80px]">
            Agents that finish what they start.
          </h1>
          <p className="mt-7 max-w-[46ch] text-[17px] leading-[1.6] text-ink-2">
            keel is a runtime for long running agents. Kill a worker mid run and it picks up on another one. Tools that
            place orders or send messages run once, never twice. Every model call and tool call is on the record.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink href="/app" variant="primary" size="lg">Start a run</ButtonLink>
            <ButtonLink href="/app/runs/run_01JDX4K9TQ" variant="secondary" size="lg">See a real run</ButtonLink>
          </div>
          <p className="mt-6 text-[13.5px] text-muted">
            Hosted, or <Mono className="text-ink-2">docker compose up</Mono> on your own box.
          </p>
        </div>
        <Replay />
      </Wrap>
    </section>
  );
}

/* ---------------- what breaks ---------------- */

const BREAKS = [
  {
    breaks: "The process dies at step 40 and starts again from step 1.",
    cost: "You pay for the same 39 model calls twice and lose the context the agent built.",
    fix: "Every step is appended to an event log before and after it has an effect. A new worker folds the log and carries on from the last finished step.",
  },
  {
    breaks: "A retry re-runs a step that already placed an order.",
    cost: "Two orders, two emails, two pull requests.",
    fix: "Each tool call gets a stable id from the run, step and position. External tools receive it as an idempotency key and are asked what happened before anything is retried.",
  },
  {
    breaks: "A run goes strange and all you have is print output.",
    cost: "No record of what the model saw, what it called, or what came back.",
    fix: "The run page shows each step: model input and output, tool inputs and outputs, timings, tokens and cost. Live while it runs, replayable after.",
  },
];

function Breaks() {
  return (
    <section id="durability" className="border-t border-rule bg-surface py-24 sm:py-32">
      <Wrap>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
          <H2>Long runs break in three ordinary ways.</H2>
          <p className="max-w-[52ch] self-end text-[16.5px] leading-[1.65] text-ink-2">
            Trading bots, research agents, scripts that call a model, run some code and hit an API for an hour. They
            fail the same way every time. keel handles all three in one small runtime, so the agent code stays plain.
          </p>
        </div>
        <div className="mt-16 border-t border-rule-strong">
          {BREAKS.map((b) => (
            <div key={b.breaks} className="grid gap-4 border-b border-rule py-8 md:grid-cols-[1fr_1fr] md:gap-16">
              <div>
                <p className="font-serif text-[26px] leading-[1.18] text-ink">{b.breaks}</p>
                <p className="mt-3 text-[14.5px] text-muted">{b.cost}</p>
              </div>
              <p className="max-w-[54ch] text-[15.5px] leading-[1.65] text-ink-2">{b.fix}</p>
            </div>
          ))}
        </div>
      </Wrap>
    </section>
  );
}

/* ---------------- effect levels ---------------- */

const EFFECTS = [
  {
    effect: "pure" as const,
    what: "Reads only. Fetching a page, reading an order book, searching.",
    doubt: "Run it again.",
  },
  {
    effect: "sandboxed" as const,
    what: "Code and shell, in a throwaway gVisor container with no network.",
    doubt: "Run it again in a fresh container.",
  },
  {
    effect: "external" as const,
    what: "Touches the real world. Orders, messages, payments, pull requests.",
    doubt: "Ask the tool's reconcile hook. If there isn't one, stop and ask a person.",
  },
];

function Effects() {
  return (
    <section id="tools" className="border-t border-rule py-24 sm:py-32">
      <Wrap className="grid gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <div>
          <H2>Every tool says how dangerous it is.</H2>
          <p className="mt-6 max-w-[48ch] text-[16.5px] leading-[1.65] text-ink-2">
            When a worker dies in the middle of a tool call, keel can&apos;t know whether it landed. What it does next
            depends on the tool&apos;s effect level, which you set once when you define it.
          </p>
          <dl className="mt-10 border-t border-rule-strong">
            {EFFECTS.map((e) => (
              <div key={e.effect} className="grid grid-cols-[96px_1fr] gap-4 border-b border-rule py-5">
                <dt className="pt-0.5">
                  <EffectTag effect={e.effect} />
                </dt>
                <dd>
                  <p className="text-[15px] text-ink">{e.what}</p>
                  <p className="mt-1.5 text-[14px] text-muted">If in doubt: {e.doubt}</p>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-8 max-w-[48ch] text-[14.5px] leading-[1.6] text-muted">
            A run stuck in review is better than a double order. It waits on the runs page with the exact call, its
            input, and a button to resolve it.
          </p>
        </div>
        <div className="flex flex-col gap-5 lg:pt-3">
          <ToolSnippet />
          <RunSnippet />
        </div>
      </Wrap>
    </section>
  );
}

/* ---------------- run viewer ---------------- */

function Viewer() {
  return (
    <section className="border-t border-rule bg-surface py-24 sm:py-32">
      <Wrap>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
          <H2>See what the model saw.</H2>
          <div className="self-end">
            <p className="max-w-[52ch] text-[16.5px] leading-[1.65] text-ink-2">
              Open any run and walk through it step by step. Expand a step for the full prompt, the response, each tool
              call with its input and output, and what it cost. Approve a pending order, cancel a runaway, or resume a
              run that needs a decision.
            </p>
            <Link href="/app/runs/run_01JDX4K9TQ" className="mt-5 inline-block text-[15px] font-medium text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
              Open the example run
            </Link>
          </div>
        </div>
        <ViewerStill />
      </Wrap>
    </section>
  );
}

function ViewerStill() {
  const rows: [string, string, string, string][] = [
    ["1", "Reading the FED-DEC book before sizing anything.", "6.3k", "$0.02"],
    ["2", "Book is 52/48. Sizing the order to land near 60/40.", "7.4k", "$0.03"],
    ["3", "Checking for any Fed news in the last hour before I trade.", "7.9k", "$0.03"],
    ["4", "No news. Buying 240 YES at 0.58 to reach 60/40.", "8.5k", "$0.03"],
    ["5", "Confirming the new position.", "9.1k", "$0.03"],
    ["6", "Bought 240 YES at 0.58 on FED-DEC. Book is now 61/39.", "13.0k", "$0.05"],
  ];
  return (
    <div className="mt-16 overflow-hidden rounded-lg border border-rule-strong bg-raised shadow-[0_24px_60px_-32px_rgb(0_0_0/0.25)]">
      <div className="grid md:grid-cols-[220px_1fr]">
        <aside className="hidden border-r border-rule p-4 text-[13px] md:block">
          <p className="text-muted">Run</p>
          <Mono className="mt-1 block text-ink">run_01JDX4K9TQ</Mono>
          <dl className="mt-5 space-y-3">
            {[
              ["Agent", "trading-agent v7"],
              ["Workers", "w-2, w-3"],
              ["Duration", "1m 34s"],
              ["Tokens", "52.1k"],
              ["Cost", "$0.21"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted">{k}</dt>
                <dd className="tnum text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </aside>
        <ol className="divide-y divide-rule text-[14px]">
          {rows.map(([n, text, tok, cost]) => (
            <li key={n} className="flex items-center gap-4 px-5 py-3.5">
              <span className="tnum w-4 text-[12.5px] text-faint">{n}</span>
              <span className="min-w-0 flex-1 truncate text-ink">{text}</span>
              {n === "4" && (
                <span className="hidden shrink-0 rounded-full border border-rule px-2 py-0.5 text-[12px] text-muted sm:inline">
                  resumed on w-3
                </span>
              )}
              <span className="tnum hidden w-12 shrink-0 text-right text-[12.5px] text-muted sm:inline">{tok}</span>
              <span className="tnum w-12 shrink-0 text-right text-[12.5px] text-muted">{cost}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* ---------------- self host ---------------- */

function SelfHost() {
  return (
    <section className="border-t border-rule py-24 sm:py-32">
      <Wrap className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <div>
          <H2>Run it on your own machine.</H2>
          <p className="mt-6 max-w-[48ch] text-[16.5px] leading-[1.65] text-ink-2">
            The same runtime ships as a compose file: web app, API, two workers, MongoDB, Redis and Jaeger. Single org,
            no billing, nothing phoning home. Write tools as plain Python.
          </p>
        </div>
        <CodeWindow title="terminal">
          <code>
            <span className="text-[#7d7d78]">$</span> git clone https://github.com/Nishu0/keel && cd keel{"\n"}
            <span className="text-[#7d7d78]">$</span> docker compose -f deploy/docker-compose.yml up{"\n"}
            {"\n"}
            <span className="text-[#9fd8a8]">✓</span> web      <span className="text-[#7d7d78]">http://localhost:3000</span>{"\n"}
            <span className="text-[#9fd8a8]">✓</span> api      <span className="text-[#7d7d78]">http://localhost:8000</span>{"\n"}
            <span className="text-[#9fd8a8]">✓</span> worker-1 <span className="text-[#7d7d78]">leasing from queue default</span>{"\n"}
            <span className="text-[#9fd8a8]">✓</span> worker-2 <span className="text-[#7d7d78]">leasing from queue default</span>
          </code>
        </CodeWindow>
      </Wrap>
    </section>
  );
}

/* ---------------- pricing ---------------- */

const PLANS = [
  {
    name: "Free",
    price: "$0",
    note: "For trying it on a real agent.",
    items: ["1 member", "2 runs at a time", "Bring your own model key", "60 sandbox minutes a month"],
    cta: "Start free",
  },
  {
    name: "Pro",
    price: "$40",
    note: "For a small team shipping agents.",
    items: ["5 members", "20 runs at a time", "1,000 sandbox minutes a month", "Use keel's model access, billed per token"],
    cta: "Start with Pro",
    featured: true,
  },
  {
    name: "Team",
    price: "Talk to us",
    note: "For agents your company depends on.",
    items: ["Unlimited members", "SSO and audit log export", "Higher limits on everything", "Dedicated sandbox nodes"],
    cta: "Contact us",
  },
];

function Pricing() {
  return (
    <section id="pricing" className="border-t border-rule bg-surface py-24 sm:py-32">
      <Wrap>
        <H2>Pay for runs, not seats you don&apos;t use.</H2>
        <div className="mt-14 grid gap-px overflow-hidden rounded-lg border border-rule-strong bg-rule md:grid-cols-3">
          {PLANS.map((p) => (
            <div key={p.name} className={`flex flex-col p-7 ${p.featured ? "bg-raised" : "bg-surface"}`}>
              <div className="flex items-baseline justify-between">
                <h3 className="text-[15px] font-medium text-ink">{p.name}</h3>
                {p.featured && <span className="text-[12.5px] text-muted">Most teams start here</span>}
              </div>
              <p className="mt-5 font-serif text-[44px] leading-none text-ink">
                {p.price}
                {p.price.startsWith("$") && <span className="ml-1 font-sans text-[14px] text-muted">/ month</span>}
              </p>
              <p className="mt-3 text-[14px] text-muted">{p.note}</p>
              <ul className="mt-7 space-y-2.5 text-[14.5px] text-ink-2">
                {p.items.map((i) => (
                  <li key={i} className="flex gap-2.5">
                    <Check className="mt-[3px] size-3.5 shrink-0 text-ink" />
                    {i}
                  </li>
                ))}
              </ul>
              <ButtonLink href="/sign-in" variant={p.featured ? "primary" : "secondary"} size="lg" className="mt-9 w-full">
                {p.cta}
              </ButtonLink>
            </div>
          ))}
        </div>
      </Wrap>
    </section>
  );
}

/* ---------------- closing + footer ---------------- */

function Closing() {
  return (
    <section className="relative overflow-hidden border-t border-rule">
      <Dither className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.1]" />
      <Wrap className="relative flex flex-col items-start gap-8 py-28 sm:py-36">
        <p className="max-w-[16ch] font-serif text-[48px] leading-[1.02] text-ink sm:text-[64px]">
          Make your agents boring to operate.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/app" variant="primary" size="lg">Start a run</ButtonLink>
          <ButtonLink href="https://github.com/Nishu0/keel" variant="secondary" size="lg">Read the source</ButtonLink>
        </div>
      </Wrap>
    </section>
  );
}

function Footer() {
  const cols: [string, [string, string][]][] = [
    ["Product", [["Run viewer", "/app/runs"], ["Agents", "/app/agents"], ["Pricing", "#pricing"]]],
    ["Developers", [["GitHub", "https://github.com/Nishu0/keel"], ["Python SDK", "#"], ["TypeScript SDK", "#"]]],
    ["Company", [["Status", "#"], ["Security", "#"], ["Contact", "#"]]],
  ];
  return (
    <footer className="border-t border-rule">
      <Wrap className="grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-[32ch] text-[13.5px] text-muted">A durable runtime for agents.</p>
        </div>
        {cols.map(([h, links]) => (
          <div key={h}>
            <p className="text-[13px] text-muted">{h}</p>
            <ul className="mt-3 space-y-2 text-[14px]">
              {links.map(([l, href]) => (
                <li key={l}>
                  <a href={href} className="text-ink-2 hover:text-ink">{l}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Wrap>
      <Wrap className="border-t border-rule py-6 text-[12.5px] text-faint">© 2026 keel</Wrap>
    </footer>
  );
}
