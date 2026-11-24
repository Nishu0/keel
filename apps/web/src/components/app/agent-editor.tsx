"use client";

import { Check, History, Play } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { cx, tokens as fmtTokens } from "@/lib/format";
import type { Agent, Tool } from "@/lib/types";
import { Button, EffectTag, Mono } from "../kit";

const MODELS: Record<Agent["model"]["provider"], string[]> = {
  anthropic: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  openai: ["gpt-5.2", "gpt-5.2-mini"],
  bedrock: ["claude-sonnet-5-5", "claude-haiku-5-5"],
};

type Draft = Pick<Agent, "description" | "model" | "system_prompt" | "tools" | "approval_required" | "limits">;

export function AgentEditor({ agent, allTools }: { agent: Agent; allTools: Tool[] }) {
  const initial: Draft = useMemo(
    () => ({
      description: agent.description,
      model: agent.model,
      system_prompt: agent.system_prompt,
      tools: agent.tools,
      approval_required: agent.approval_required,
      limits: agent.limits,
    }),
    [agent],
  );
  const [d, setD] = useState<Draft>(initial);
  const [version, setVersion] = useState(agent.version);
  const [base, setBase] = useState<Draft>(initial);
  const [saved, setSaved] = useState(false);
  const [view, setView] = useState<"edit" | "diff">("edit");
  const changes = diff(base, d);
  const dirty = changes.length > 0;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setSaved(false);
    setD((p) => ({ ...p, [k]: v }));
  };
  const toggleTool = (id: string) =>
    set("tools", d.tools.includes(id) ? d.tools.filter((t) => t !== id) : [...d.tools, id]);
  const toggleApproval = (id: string) =>
    set("approval_required", d.approval_required.includes(id) ? d.approval_required.filter((t) => t !== id) : [...d.approval_required, id]);

  const save = () => {
    setVersion((v) => v + 1);
    setBase(d);
    setSaved(true);
    setView("edit");
  };

  return (
    <div className="grid gap-10 px-6 py-6 lg:px-10 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div className="sticky top-0 z-10 -mx-2 mb-6 flex items-center gap-2 bg-paper/90 px-2 py-2 backdrop-blur">
          <div className="flex gap-1">
            {(["edit", "diff"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cx("h-7 rounded-md px-2.5 text-[13px]", view === v ? "bg-wash font-medium text-ink" : "text-muted-foreground hover:text-ink")}
              >
                {v === "edit" ? "Config" : `Changes ${changes.length}`}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[13px] text-muted-foreground" aria-live="polite">
            {saved ? (
              <span className="inline-flex items-center gap-1.5 text-ink-2"><Check className="size-3.5 text-st-completed" /> Saved as v{version}</span>
            ) : dirty ? (
              `Unsaved, will become v${version + 1}`
            ) : (
              `v${version}, current`
            )}
          </span>
          <Button size="sm" disabled={!dirty} onClick={() => { setD(base); setSaved(false); }}>Discard</Button>
          <Button size="sm" variant="primary" disabled={!dirty} onClick={save}>Save as v{version + 1}</Button>
        </div>

        {view === "diff" ? (
          <DiffView changes={changes} from={version} />
        ) : (
          <div className="space-y-10">
            <Field label="Description" hint="Shown on the agents list. Not sent to the model.">
              <input
                value={d.description}
                onChange={(e) => set("description", e.target.value)}
                className="h-9 w-full rounded-md border border-rule-strong bg-raised px-3 text-[14px] text-ink outline-none focus:border-ink"
              />
            </Field>

            <Field label="Model" hint="Swap providers without touching tools or prompt. Keys come from Secrets.">
              <div className="flex flex-wrap gap-2">
                <select
                  value={d.model.provider}
                  onChange={(e) => {
                    const provider = e.target.value as Agent["model"]["provider"];
                    set("model", { provider, name: MODELS[provider][0] });
                  }}
                  className="h-9 rounded-md border border-rule-strong bg-raised px-3 text-[14px] text-ink"
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="bedrock">Bedrock</option>
                </select>
                <select
                  value={d.model.name}
                  onChange={(e) => set("model", { ...d.model, name: e.target.value })}
                  className="h-9 rounded-md border border-rule-strong bg-raised px-3 font-mono text-[13px] text-ink"
                >
                  {MODELS[d.model.provider].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
            </Field>

            <Field label="System prompt">
              <textarea
                value={d.system_prompt}
                onChange={(e) => set("system_prompt", e.target.value)}
                rows={7}
                className="w-full resize-y rounded-md border border-rule-strong bg-raised px-3.5 py-3 font-mono text-[13px] leading-[1.7] text-ink outline-none focus:border-ink"
              />
              <p className="tnum mt-1.5 text-right text-[12px] text-faint">{d.system_prompt.length} characters</p>
            </Field>

            <Field label="Tools" hint="Tick what this agent may call. Approval pauses the run until someone in the org says yes.">
              <ul className="divide-y divide-rule rounded-lg border border-rule-strong bg-raised">
                {allTools.map((t) => {
                  const on = d.tools.includes(t.id);
                  const gated = d.approval_required.includes(t.id);
                  return (
                    <li key={t.id} className={cx("flex items-center gap-3 px-3.5 py-2.5", !on && "opacity-60")}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleTool(t.id)}
                        id={`tool-${t.id}`}
                        className="size-4 accent-[var(--ink)]"
                      />
                      <label htmlFor={`tool-${t.id}`} className="min-w-0 flex-1 cursor-pointer">
                        <span className="flex items-center gap-2">
                          <Mono className="text-ink">{t.name}</Mono>
                          <EffectTag effect={t.effect} />
                        </span>
                        <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">{t.description}</span>
                      </label>
                      {on && (
                        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[12.5px] text-ink-2">
                          <input type="checkbox" checked={gated} onChange={() => toggleApproval(t.id)} className="size-3.5 accent-[var(--st-review)]" />
                          Needs approval
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Field>

            <Field label="Limits" hint="When a run hits one, it ends with limit.exceeded at the next step boundary.">
              <div className="grid gap-3 sm:grid-cols-3">
                <NumberField label="Max steps" value={d.limits.max_steps} onChange={(v) => set("limits", { ...d.limits, max_steps: v })} />
                <NumberField label="Token budget" value={d.limits.max_tokens} step={10_000} onChange={(v) => set("limits", { ...d.limits, max_tokens: v })} display={fmtTokens} />
                <NumberField label="Timeout (s)" value={d.limits.timeout_s} step={60} onChange={(v) => set("limits", { ...d.limits, timeout_s: v })} />
              </div>
            </Field>
          </div>
        )}
      </div>

      <aside className="space-y-8 xl:sticky xl:top-6 xl:self-start">
        <TestPanel agentId={agent.id} dirty={dirty} />
        <Versions current={version} updatedBy={agent.updated_by} />
      </aside>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[14px] font-medium text-ink">{label}</h3>
      {hint && <p className="mb-3 mt-0.5 text-[13px] text-muted-foreground">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}

function NumberField({ label, value, onChange, step = 1, display }: { label: string; value: number; onChange: (v: number) => void; step?: number; display?: (n: number) => string }) {
  return (
    <label className="block rounded-md border border-rule-strong bg-raised px-3 py-2 focus-within:border-ink">
      <span className="block text-[12px] text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={1}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
        className="tnum mt-0.5 w-full bg-transparent text-[15px] text-ink outline-none"
      />
      {display && <span className="tnum block text-[11.5px] text-faint">{display(value)}</span>}
    </label>
  );
}

function TestPanel({ agentId, dirty }: { agentId: string; dirty: boolean }) {
  const [input, setInput] = useState("Read the FED-DEC book and report the spread. Do not trade.");
  const [started, setStarted] = useState(false);
  return (
    <section className="rounded-lg border border-rule-strong bg-raised p-4">
      <h3 className="text-[14px] font-medium text-ink">Try it</h3>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        {dirty ? "Runs against your unsaved changes as a draft version." : "Starts a real run with this input."}
      </p>
      <textarea
        value={input}
        onChange={(e) => { setInput(e.target.value); setStarted(false); }}
        rows={4}
        aria-label="Test input"
        className="mt-3 w-full resize-none rounded-md border border-rule bg-paper px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink"
      />
      {started ? (
        <p className="mt-2 flex items-center gap-2 text-[13px] text-ink-2">
          <i className="size-2 animate-pulse-dot rounded-full bg-st-running" />
          Queued.{" "}
          <Link href={`/app/runs?agent=${agentId}`} className="font-medium text-ink underline decoration-rule-strong underline-offset-4">
            Watch it
          </Link>
        </p>
      ) : (
        <Button variant="primary" className="mt-2 w-full" disabled={!input.trim()} onClick={() => setStarted(true)}>
          <Play className="size-3.5" /> Start test run
        </Button>
      )}
    </section>
  );
}

function Versions({ current, updatedBy }: { current: number; updatedBy: string }) {
  const notes = ["Current", "Approval on place_order", "Tighter risk wording", "Switched to sonnet", "Added run_python"];
  return (
    <section>
      <h3 className="flex items-center gap-2 text-[14px] font-medium text-ink">
        <History className="size-3.5 text-muted-foreground" /> Versions
      </h3>
      <ol className="mt-3 border-l border-rule-strong">
        {notes.map((n, i) => {
          const v = current - i;
          if (v < 1) return null;
          return (
            <li key={v} className="relative pb-3 pl-4 last:pb-0">
              <span className={cx("absolute -left-[4.5px] top-1.5 size-2 rounded-full", i === 0 ? "bg-ink" : "border border-rule-strong bg-paper")} />
              <p className="text-[13.5px] text-ink">
                v{v} <span className="text-muted-foreground">{n}</span>
              </p>
              <p className="text-[12px] text-faint">{i === 0 ? updatedBy : ["Ana Ruiz", "Ira Menon", "Sam Okafor"][i % 3]}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ---------------- diff ---------------- */

type Change = { field: string; before: string; after: string };

function diff(a: Draft, b: Draft): Change[] {
  const out: Change[] = [];
  const cmp = (field: string, x: unknown, y: unknown, fmt: (v: unknown) => string = (v) => String(v)) => {
    if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ field, before: fmt(x), after: fmt(y) });
  };
  cmp("description", a.description, b.description);
  cmp("model", a.model, b.model, (v) => { const m = v as Agent["model"]; return `${m.provider} / ${m.name}`; });
  cmp("system_prompt", a.system_prompt, b.system_prompt);
  cmp("tools", [...a.tools].sort(), [...b.tools].sort(), (v) => (v as string[]).join("\n"));
  cmp("approval_required", [...a.approval_required].sort(), [...b.approval_required].sort(), (v) => (v as string[]).join("\n") || "(none)");
  cmp("limits", a.limits, b.limits, (v) => { const l = v as Agent["limits"]; return `max_steps ${l.max_steps}\nmax_tokens ${l.max_tokens}\ntimeout_s ${l.timeout_s}`; });
  return out;
}

function DiffView({ changes, from }: { changes: Change[]; from: number }) {
  if (!changes.length) {
    return (
      <div className="rounded-lg border border-dashed border-rule-strong px-6 py-14 text-center">
        <p className="font-serif text-[22px] text-ink">No changes since v{from}.</p>
        <p className="mt-1 text-[14px] text-muted-foreground">Edit the config and the differences show up here before you save.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {changes.map((c) => (
        <div key={c.field} className="overflow-hidden rounded-lg border border-rule-strong bg-raised">
          <p className="border-b border-rule px-3.5 py-2 font-mono text-[12.5px] text-ink">{c.field}</p>
          <div className="font-mono text-[12.5px] leading-[1.7]">
            {lines(c.before, c.after).map((l, i) => (
              <div
                key={i}
                className={cx(
                  "flex gap-3 whitespace-pre-wrap px-3.5",
                  l.kind === "-" && "bg-[color-mix(in_oklab,var(--st-failed)_9%,transparent)] text-ink",
                  l.kind === "+" && "bg-[color-mix(in_oklab,var(--st-completed)_10%,transparent)] text-ink",
                  l.kind === " " && "text-muted-foreground",
                )}
              >
                <span className="w-3 shrink-0 select-none text-faint">{l.kind}</span>
                <span className="min-w-0">{l.text || " "}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// line diff via LCS; inputs are a handful of lines so O(n*m) is fine
function lines(a: string, b: string): { kind: "-" | "+" | " "; text: string }[] {
  const x = a.split("\n");
  const y = b.split("\n");
  const dp = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { kind: "-" | "+" | " "; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { out.push({ kind: " ", text: x[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: "-", text: x[i++] });
    else out.push({ kind: "+", text: y[j++] });
  }
  while (i < x.length) out.push({ kind: "-", text: x[i++] });
  while (j < y.length) out.push({ kind: "+", text: y[j++] });
  return out;
}
