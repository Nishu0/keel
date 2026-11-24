import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CodeWindow, RunSnippet, ToolSnippet } from "@/components/landing/code";
import { Footer } from "@/components/landing/footer";
import { Nav } from "@/components/landing/nav";
import { AppWindow } from "@/components/landing/app-window";
import { Bento } from "@/components/landing/bento";
import { Fits } from "@/components/landing/fits";
import { DotField } from "@/components/landing/dot-field";
import { ButtonLink, EffectTag } from "@/components/kit";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        <Features />
        <WhereItFits />
        <Effects />
        <SelfHost />
        <Pricing />
      </main>
      <Footer />
    </>
  );
}

function Wrap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1160px] px-5 sm:px-8 ${className}`}>{children}</div>;
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
    <section className="relative -mt-16 overflow-hidden bg-background pt-16">
      <DotField className="pointer-events-none absolute inset-0 h-full w-full" />
      {/* fade the texture out under the window so the page below starts clean */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
      <div className="relative mx-auto max-w-[1240px] px-5 pt-24 text-center sm:px-8 sm:pt-28">
        <h1 className="mx-auto max-w-[14ch] font-serif text-[56px] leading-[0.95] tracking-[-0.02em] text-foreground sm:text-[88px] lg:text-[112px]">
          Agents that finish what they <span className="text-dither pr-[0.06em]">start.</span>
        </h1>
        <p className="mx-auto mt-8 max-w-[48ch] text-[18px] leading-[1.5] text-muted-foreground sm:text-[21px]">
          A runtime for long running agents. Runs survive crashes, tools never fire twice, and every step is on the record.
        </p>
        <div className="mt-11 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/app/runs/run_01JDX4K9TQ"
            className="inline-flex h-12 items-center rounded-lg border border-white/15 bg-background px-7 text-[17px] text-foreground transition-colors hover:border-white/25 hover:bg-white/[0.03]"
          >
            See a real run
          </Link>
          <Link href="/app" className="btn-sheen inline-flex h-12 items-center rounded-lg px-7 text-[17px] text-foreground">
            Get started
          </Link>
        </div>
        <div className="relative mt-20 text-left">
          <AppWindow />
        </div>
      </div>
    </section>
  );
}

/* ---------------- bento ---------------- */

function Features() {
  return (
    <section id="durability" className="scroll-mt-20 py-24 sm:py-32">
      <Wrap className="max-w-[1240px]">
        <Bento />
      </Wrap>
    </section>
  );
}

/* ---------------- where keel fits ---------------- */

function WhereItFits() {
  return (
    <section id="fits" className="scroll-mt-20 border-t border-rule py-24 sm:py-32">
      <Wrap className="max-w-[1240px]">
        <div className="mb-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-16">
          <H2>
            <em className="italic">Not</em> another memory layer.
          </H2>
          <p className="max-w-[54ch] self-end text-[16.5px] leading-[1.65] text-ink-2">
            Memory layers decide what an agent remembers. Harnesses decide how it thinks. Neither one knows whether the order
            from step 4 actually went out before the box died. That is the part keel owns.
          </p>
        </div>
        <Fits />
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
      <Wrap className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-20">
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
                  <p className="mt-1.5 text-[14px] text-muted-foreground">If in doubt: {e.doubt}</p>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-8 max-w-[48ch] text-[14.5px] leading-[1.6] text-muted-foreground">
            A run stuck in review is better than a double order. It waits on the runs page with the exact call, its
            input, and a button to resolve it.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-5 lg:pt-3">
          <ToolSnippet />
          <RunSnippet />
        </div>
      </Wrap>
    </section>
  );
}

/* ---------------- self host ---------------- */

function SelfHost() {
  return (
    <section className="border-t border-rule py-24 sm:py-32">
      <Wrap className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
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

// mirrors keel/accounts/plans.py; these are the limits the api enforces
const PLANS = [
  {
    name: "Free",
    price: "$0",
    note: "For trying it on a real agent.",
    items: ["1 member", "2 runs at a time", "500 runs and 2M tokens a month", "60 sandbox minutes", "Bring your own model key"],
    cta: "Start free",
  },
  {
    name: "Pro",
    price: "$40",
    note: "For a small team shipping agents.",
    items: ["5 members", "20 runs at a time", "20,000 runs and 100M tokens a month", "1,000 sandbox minutes", "Use keel's model access"],
    cta: "Start with Pro",
    featured: true,
  },
  {
    name: "Team",
    price: "Talk to us",
    note: "For agents your company depends on.",
    items: ["Unlimited members", "100 runs at a time", "200,000 runs and 1B tokens a month", "10,000 sandbox minutes", "Use keel's model access"],
    cta: "Contact us",
  },
];

function Pricing() {
  return (
    <section id="pricing" className="border-t border-rule py-24 sm:py-32">
      <Wrap>
        <H2>Pay for runs, not seats you don&apos;t use.</H2>
        <div className="mt-14 grid gap-px overflow-hidden rounded-lg border border-rule-strong bg-rule md:grid-cols-3">
          {PLANS.map((p) => (
            <div key={p.name} className="flex flex-col bg-background p-7">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[15px] font-medium text-ink">{p.name}</h3>
                {p.featured && <span className="text-[12.5px] text-muted-foreground">Most teams start here</span>}
              </div>
              <p className="stat-num mt-5 text-[44px] leading-none text-ink">
                {p.price}
                {p.price.startsWith("$") && <span className="ml-1 font-sans text-[14px] text-muted-foreground">/ month</span>}
              </p>
              <p className="mt-3 text-[14px] text-muted-foreground">{p.note}</p>
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
        <p className="mt-6 text-[14px] text-muted-foreground">
          Every plan includes crash safe runs, at most once tools, approvals, replay, fork and compare, schedules and triggers, and MCP and webhook tools. Self hosting is free.
        </p>
      </Wrap>
    </section>
  );
}

