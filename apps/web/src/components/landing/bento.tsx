import { Check, CornerDownRight, GitBranch, Hand, Plug, RotateCcw, ShieldCheck, Sparkles, Terminal, X, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/format";
import { EffectTag, Mark, Mono } from "../kit";

/* ---------------- shell ---------------- */

function Card({
  title,
  lead,
  sub,
  children,
  className,
  tall,
}: {
  title: ReactNode;
  lead: string;
  sub: string;
  children: ReactNode;
  className?: string;
  tall?: boolean;
}) {
  return (
    <article
      className={cx(
        "relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-background",
        // faint dot texture in the top right corner, like light catching the card
        "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle,rgb(255_255_255/0.09)_1px,transparent_1.3px)] before:[background-size:6px_6px] before:[mask-image:radial-gradient(120%_80%_at_100%_0%,black,transparent_55%)]",
        className,
      )}
    >
      <div className="relative px-8 pt-8 sm:px-10 sm:pt-10">
        <h3 className="max-w-[22ch] font-serif text-[30px] leading-[1.1] text-foreground sm:text-[34px]">
          <em className="italic">{lead}</em> {title}
        </h3>
        <p className="mt-4 max-w-[46ch] text-[16.5px] leading-[1.55] text-muted-foreground">{sub}</p>
      </div>
      {/* the mockup always runs off the bottom edge, so every card in a row ends the same way */}
      <div className={cx("relative mt-auto overflow-hidden px-8 pt-9 sm:px-10", tall ? "h-[370px]" : "h-[280px]")}>{children}</div>
    </article>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("min-h-full rounded-t-xl border border-b-0 border-white/[0.08] bg-background", className)}>{children}</div>;
}

/* ---------------- 1. resume ---------------- */

function ResumeMock() {
  const done = (step: number, tool: string, worker: string) => (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="tnum w-4 text-right text-[12px] text-faint">{step}</span>
      <Check className="size-3.5 text-st-completed" />
      <Mono className="text-ink-2">{tool}</Mono>
      <span className="ml-auto rounded border border-white/10 px-1.5 font-mono text-[11px] text-muted-foreground">{worker}</span>
    </li>
  );
  return (
    <Panel>
      <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3 text-[14px]">
        <Mark className="size-6" />
        <span className="text-foreground">trading-agent</span>
        <Mono className="text-[12px] text-muted-foreground">run_01JDX4K9TQ</Mono>
      </div>
      <ul className="divide-y divide-white/[0.05] text-[14px]">
        {done(1, "get_orderbook", "w-2")}
        {done(2, "run_python", "w-2")}
        {done(3, "web_fetch", "w-2")}
        <li className="flex items-center gap-3 bg-[color-mix(in_oklab,var(--st-failed)_9%,transparent)] px-4 py-2.5 text-foreground">
          <Zap className="ml-7 size-3.5 text-st-failed" />
          <span>
            <Mono>w-2</Mono> was killed. Lease ran out 20s later.
          </span>
        </li>
        <li className="flex items-center gap-3 px-4 py-2.5 text-foreground">
          <RotateCcw className="ml-7 size-3.5 text-st-running" />
          <span>
            Resumed on <Mono>w-3</Mono>. 6 results reused, nothing paid twice.
          </span>
        </li>
        {done(4, "place_order", "w-3")}
      </ul>
    </Panel>
  );
}

/* ---------------- 2. at most once ---------------- */

function OnceMock() {
  return (
    <Panel className="p-5">
      <div className="ml-auto w-fit max-w-[90%] rounded-xl bg-white/[0.07] px-4 py-2.5 text-[15px] text-foreground">
        Rebalance FED-DEC toward 60/40.
      </div>
      <p className="mt-5 text-[14px] text-muted-foreground">6 steps · 2 workers · 1 order</p>
      <div className="mt-3 rounded-lg border border-white/[0.08] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Mono className="text-[14px] text-foreground">place_order</Mono>
          <EffectTag effect="external" />
          <span className="ml-auto text-[13px] text-st-completed">Filled 240 at 0.58</span>
        </div>
        <p className="mt-1.5 font-mono text-[12px] text-muted-foreground">Idempotency-Key: tc_4be81f</p>
      </div>
      <ol className="ml-2 mt-4 space-y-3 border-l border-white/10 pl-5 text-[14px]">
        <li className="relative text-ink-2">
          <i className="absolute -left-[25px] top-1.5 size-2 rounded-full bg-st-failed" />
          Attempt 1: the worker died mid call
        </li>
        <li className="relative text-ink-2">
          <i className="absolute -left-[25px] top-1.5 size-2 rounded-full bg-st-review" />
          Asked the desk: <Mono className="text-muted-foreground">GET /status?key=tc_4be81f</Mono>
        </li>
        <li className="relative text-foreground">
          <i className="absolute -left-[25px] top-1.5 size-2 rounded-full bg-st-completed" />
          It landed. Recorded it, didn&apos;t resend.
        </li>
      </ol>
    </Panel>
  );
}

/* ---------------- 3. record ---------------- */

function LogMock() {
  const rows: [number, string, string, string?][] = [
    [14, "model.completed", "No news. Buying 240 YES"],
    [15, "approval.requested", "place_order", "var(--st-review)"],
    [16, "approval.granted", "by Ana Ruiz", "var(--st-review)"],
    [17, "tool.started", "place_order"],
    [18, "tool.completed", "filled · 740ms", "var(--st-completed)"],
    [19, "model.requested", "step 5"],
  ];
  return (
    <Panel className="py-2">
      {rows.map(([seq, type, note, tone]) => (
        <div key={seq} className="flex items-baseline gap-3 px-4 py-1.5 font-mono text-[12.5px]">
          <span className="tnum w-5 text-right text-faint">{seq}</span>
          <span style={{ color: tone ?? "var(--foreground)" }}>{type}</span>
          <span className="truncate font-sans text-[13px] text-muted-foreground">{note}</span>
        </div>
      ))}
    </Panel>
  );
}

/* ---------------- 4. approvals ---------------- */

function ApprovalMock() {
  return (
    <Panel className="p-5">
      <div className="flex items-center gap-2.5 text-[15px]">
        <span className="flex size-7 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--st-review)_18%,transparent)]">
          <Hand className="size-3.5 text-st-review" />
        </span>
        <span className="text-foreground">inbox-triage</span>
        <span className="ml-auto text-[13px] text-st-review">Waiting 0:24</span>
      </div>
      <div className="mt-4 rounded-lg border border-white/[0.08] px-4 py-3">
        <div className="flex items-center gap-2">
          <CornerDownRight className="size-3.5 text-faint" />
          <Mono className="text-foreground">send_slack</Mono>
          <EffectTag effect="external" />
        </div>
        <p className="mt-2 text-[14px] leading-[1.5] text-ink-2">#support: &ldquo;Billing fix is live, your invoice will regenerate tonight.&rdquo;</p>
      </div>
      <div className="mt-4 flex gap-2">
        <span className="btn-sheen inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-[14px] text-foreground">
          <Check className="size-3.5" /> Approve
        </span>
        <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 px-4 text-[14px] text-foreground">
          <X className="size-3.5" /> Deny
        </span>
      </div>
    </Panel>
  );
}

/* ---------------- 5. connections ---------------- */

function ConnectionsMock() {
  const rows: [ReactNode, string, string][] = [
    [<Sparkles key="m" className="size-4" />, "Claude", "Anthropic API · Bedrock"],
    [<GitBranch key="g" className="size-4" />, "Webhook tools", "HMAC signed"],
    [<Plug key="p" className="size-4" />, "MCP servers", "Listed on connect"],
    [<Terminal key="t" className="size-4" />, "Python and shell", "gVisor, no network"],
    [<ShieldCheck key="s" className="size-4" />, "Secrets", "KMS, never logged"],
  ];
  return (
    <Panel>
      <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-4 py-3 text-[15px] text-foreground">
        <Plug className="size-4 text-muted-foreground" /> Connections
      </div>
      <ul className="divide-y divide-white/[0.05]">
        {rows.map(([icon, name, note]) => (
          <li key={name} className="flex items-center gap-3 px-4 py-2.5 text-[14px]">
            <span className="flex size-7 items-center justify-center rounded-md bg-white/[0.06] text-ink-2">{icon}</span>
            <span className="shrink-0 whitespace-nowrap text-foreground">{name}</span>
            <span className="ml-auto min-w-0 truncate text-right text-[12.5px] text-muted-foreground">{note}</span>
            <i className="size-1.5 shrink-0 rounded-full bg-st-completed" />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ---------------- 6. fork and compare ---------------- */

function ForkMock() {
  const row = (n: number, text: string, state: "same" | "diff" | "new") => (
    <li className={cx("flex items-center gap-3 px-4 py-2", state === "diff" && "bg-[color-mix(in_oklab,var(--st-review)_7%,transparent)]")}>
      <span className="tnum w-4 text-right text-[12px] text-faint">{n}</span>
      {state === "same" ? <Check className="size-3.5 text-st-completed" /> : <GitBranch className="size-3.5 text-st-review" />}
      <span className={cx("truncate text-[13px]", state === "same" ? "text-muted-foreground" : "text-foreground")}>{text}</span>
    </li>
  );
  return (
    <Panel className="py-2">
      <div className="flex items-center gap-2 px-4 pb-2 text-[12px] text-muted-foreground">
        <Mono className="text-ink-2">run_7Q2</Mono> forked at step 3, on agent v4
      </div>
      <ul>
        {row(1, "read_book returned 0.41", "same")}
        {row(2, "No news since 09:00", "same")}
        {row(3, "Spread is too wide, waiting", "diff")}
        {row(4, "Asked for approval at 0.39", "new")}
      </ul>
      <div className="mt-2 flex gap-4 border-t border-white/[0.06] px-4 pt-2.5 text-[12.5px] text-muted-foreground">
        <span>Steps 4 → 4</span>
        <span className="text-st-completed">Cost -38%</span>
      </div>
    </Panel>
  );
}

/* ---------------- 7. schedules and triggers ---------------- */

function AutomationMock() {
  return (
    <Panel className="space-y-3 p-4">
      <div className="rounded-lg border border-white/[0.08] px-3.5 py-3">
        <p className="text-[13.5px] text-foreground">Morning digest</p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          <Mono className="text-ink-2">0 9 * * 1-5</Mono> · next Tue 09:00 UTC
        </p>
      </div>
      <div className="rounded-lg border border-white/[0.08] px-3.5 py-3">
        <p className="text-[13.5px] text-foreground">New GitHub issues</p>
        <p className="mt-1 truncate font-mono text-[11.5px] text-muted-foreground">POST /hooks/trg_••••</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-ink-2">
          <CornerDownRight className="size-3.5 text-faint" /> Triage issue #42: Crash on start
        </p>
      </div>
    </Panel>
  );
}

/* ---------------- 8. handoffs ---------------- */

function HandoffMock() {
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2 text-[13px]">
        <i className="size-1.5 rounded-full bg-st-review" />
        <span className="text-foreground">planner</span>
        <span className="text-muted-foreground">waiting, no worker held</span>
      </div>
      <div className="ml-[3px] mt-2 space-y-2 border-l border-white/[0.1] pl-4">
        <div className="flex items-center gap-2 text-[13px]">
          <Mono className="text-ink-2">handoff__researcher</Mono>
        </div>
        <div className="rounded-lg border border-white/[0.08] px-3 py-2.5">
          <p className="flex items-center gap-2 text-[13px] text-foreground">
            <Sparkles className="size-3.5 text-faint" /> researcher
            <span className="ml-auto text-[12px] text-st-completed">Completed</span>
          </p>
          <p className="mt-1 truncate text-[12.5px] text-muted-foreground">Found 3 sources. Rates held at 4.25%.</p>
        </div>
        <p className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
          <CornerDownRight className="size-3.5 text-faint" /> answer returned as the tool result
        </p>
      </div>
    </Panel>
  );
}

/* ---------------- grid ---------------- */

export function Bento() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card tall lead="Crash proof runs" title="that pick up where they died" sub="Kill a worker at any line. The next one replays the event log and carries on from the last finished step.">
          <ResumeMock />
        </Card>
        <Card tall lead="At most once" title="for tools that touch money" sub="Every call carries a stable idempotency key. If a worker dies mid call, keel asks the tool what happened before it does anything.">
          <OnceMock />
        </Card>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card lead="Every step" title="on the record" sub="An append only log of what the model saw, what it called, and what came back. Live, then replayable.">
          <LogMock />
        </Card>
        <Card lead="A person in the loop" title="when it matters" sub="Gate any tool behind approval. The run pauses, holds no worker, pings Slack or email, and resumes the moment someone decides.">
          <ApprovalMock />
        </Card>
        <Card lead="Any model, any tool" title="you already run" sub="Bring Claude, your webhooks and MCP servers. Code runs in a sandbox with no network.">
          <ConnectionsMock />
        </Card>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card lead="Fork from any step" title="and see what changed" sub="Rerun from step N with a new prompt or different data. The steps before it are reused, then compare the two runs side by side.">
          <ForkMock />
        </Card>
        <Card lead="Runs that start themselves" title="on a cron or a url" sub="Schedule an agent, or give it a secret url that GitHub, a form or your own code can post to. Each due time runs exactly once.">
          <AutomationMock />
        </Card>
        <Card lead="Agents that delegate" title="to other agents" sub="Hand a task to another agent. The child runs on its own while the parent waits for free, then gets the answer back.">
          <HandoffMock />
        </Card>
      </div>
    </div>
  );
}
