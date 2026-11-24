"use client";

import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, Mono } from "../kit";

type ApiAgent = {
  id: string;
  name: string;
  version: number;
  model: string;
  system_prompt: string;
  tools: string[];
  approval_required: string[];
};

// tools every keel worker ships with; webhook and mcp tools are registered on the Tools page
const BUILTIN = [
  { name: "web_fetch", effect: "pure", note: "Fetch a public url" },
  { name: "current_time", effect: "pure", note: "The time in UTC" },
  { name: "run_python", effect: "sandboxed", note: "Needs the docker sandbox" },
  { name: "run_shell", effect: "sandboxed", note: "Needs the docker sandbox" },
];
const MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];

/** Agents from the api, plus a button to create one. Renders nothing when the api isn't connected. */
export function LiveAgents({ demo }: { demo: React.ReactNode }) {
  const [agents, setAgents] = useState<ApiAgent[] | null>(null);
  const [open, setOpen] = useState(false);

  const [offline, setOffline] = useState(false);
  const load = () =>
    fetch("/api/keel/v1/agents")
      .then(async (r) => (r.ok ? setAgents((await r.json()) as ApiAgent[]) : setOffline(true)))
      .catch(() => setOffline(true));
  useEffect(() => {
    load();
  }, []);

  if (offline) return <>{demo}</>;
  if (!agents) return <div className="h-40" />;
  return (
    <section className="border-b border-rule px-6 py-6 lg:px-10">
      <div className="flex items-center gap-3">
        <h2 className="text-[14px] font-medium text-ink">In your api</h2>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <i className="size-1.5 rounded-full bg-st-completed" /> Live
        </span>
        <Button size="sm" variant="primary" className="ml-auto" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" /> New agent
        </Button>
      </div>
      {agents.length === 0 ? (
        <p className="mt-3 text-[14px] text-muted-foreground">No agents yet. Create one to start runs against the api.</p>
      ) : (
        <ul className="mt-3 divide-y divide-rule overflow-hidden rounded-lg border border-rule-strong bg-raised">
          {agents.map((a) => (
            <li key={a.id}>
              <Link href={`/app/runs?agent=${a.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-wash">
                <span className="text-[14.5px] text-ink">{a.name}</span>
                <span className="text-[12px] text-faint">v{a.version}</span>
                <span className="flex flex-wrap gap-1.5">
                  {a.tools.map((t) => (
                    <span key={t} className="rounded border border-rule px-1.5 font-mono text-[11px] text-ink-2">
                      {t}
                      {a.approval_required.includes(t) && <span className="ml-1 font-sans text-st-review">approval</span>}
                    </span>
                  ))}
                </span>
                <Mono className="ml-auto text-[11.5px] text-muted-foreground">{a.model}</Mono>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <NewAgentDialog
          existing={agents}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            load();
          }}
        />
      )}
    </section>
  );
}

function NewAgentDialog({ existing, onClose, onCreated }: { existing: ApiAgent[]; onClose: () => void; onCreated: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [model, setModel] = useState(MODELS[0]);
  const [prompt, setPrompt] = useState("");
  const [tools, setTools] = useState<string[]>(["web_fetch"]);
  const [gated, setGated] = useState<string[]>([]);
  const [handoffs, setHandoffs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
    // showModal focuses the first control (the close button); start in the first field instead
    ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);

  const toggle = (list: string[], set: (v: string[]) => void, t: string) => set(list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);

  const create = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/keel/v1/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        model,
        system_prompt: prompt,
        tools,
        approval_required: gated.filter((g) => tools.includes(g)),
        agents: handoffs,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      const detail = r ? ((await r.json().catch(() => ({}))) as { detail?: unknown }).detail : null;
      return setError(typeof detail === "string" ? detail : "Couldn't create the agent.");
    }
    ref.current?.close();
    onCreated();
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-lg border border-rule-strong bg-raised p-0 text-ink shadow-[0_30px_80px_-20px_rgb(0_0_0/0.5)] backdrop:bg-black/40"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
        className="p-5"
      >
        <div className="flex items-start justify-between">
          <h2 className="font-serif text-[26px] leading-none">New agent</h2>
          <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="rounded p-1 text-muted-foreground hover:bg-wash hover:text-ink">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_200px]">
          <label className="block">
            <span className="mb-1.5 block text-[13px] text-ink-2">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              data-autofocus
              placeholder="research-agent"
              className="h-9 w-full rounded-md border border-rule-strong bg-paper px-3 font-mono text-[13.5px] outline-none placeholder:text-faint focus:border-ink"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] text-ink-2">Model</span>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="h-9 w-full rounded-md border border-rule-strong bg-paper px-2 font-mono text-[12.5px]">
              {MODELS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] text-ink-2">System prompt</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="What this agent is for, and the rules it follows."
            className="w-full resize-none rounded-md border border-rule-strong bg-paper px-3 py-2 text-[13.5px] outline-none placeholder:text-faint focus:border-ink"
          />
        </label>

        <fieldset className="mt-4">
          <legend className="mb-1.5 text-[13px] text-ink-2">Tools</legend>
          <ul className="divide-y divide-rule rounded-md border border-rule-strong">
            {BUILTIN.map((t) => (
              <li key={t.name} className="flex items-center gap-3 px-3 py-2">
                <input
                  type="checkbox"
                  id={`nt-${t.name}`}
                  checked={tools.includes(t.name)}
                  onChange={() => toggle(tools, setTools, t.name)}
                  className="size-4 accent-[var(--ink)]"
                />
                <label htmlFor={`nt-${t.name}`} className="min-w-0 flex-1 cursor-pointer">
                  <Mono className="text-ink">{t.name}</Mono>
                  <span className="ml-2 text-[12px] text-muted-foreground">{t.note}</span>
                </label>
                {tools.includes(t.name) && (
                  <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
                    <input type="checkbox" checked={gated.includes(t.name)} onChange={() => toggle(gated, setGated, t.name)} className="size-3.5 accent-[var(--st-review)]" />
                    Needs approval
                  </label>
                )}
              </li>
            ))}
          </ul>
        </fieldset>

        {existing.length > 0 && (
          <fieldset className="mt-4">
            <legend className="mb-1.5 text-[13px] text-ink-2">Can hand work to</legend>
            <div className="flex flex-wrap gap-2">
              {existing.map((a) => {
                const on = handoffs.includes(a.id);
                return (
                  <button
                    type="button"
                    key={a.id}
                    aria-pressed={on}
                    onClick={() => setHandoffs(on ? handoffs.filter((x) => x !== a.id) : [...handoffs, a.id])}
                    className={`h-8 rounded-full border px-3 font-mono text-[12.5px] transition-colors ${on ? "border-white/40 bg-white/[0.08] text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {a.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[12px] text-muted-foreground">Each one becomes a handoff tool. The child runs on its own and its answer comes back as the result.</p>
          </fieldset>
        )}

        {error && <p role="alert" className="mt-3 text-[13px] text-st-failed">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" onClick={() => ref.current?.close()}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            {busy ? "Creating" : "Create agent"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
