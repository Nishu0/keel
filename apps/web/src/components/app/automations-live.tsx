"use client";

import { CalendarClock, Copy, Plus, Trash2, Webhook } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { send, useApi } from "@/lib/live";
import { Button, Mono } from "../kit";

type Agent = { id: string; name: string };
type ScheduleRow = { id: string; agent_id: string; name: string; cron: string; task: string; enabled: boolean; next_run_at: string; last_run_id: string | null };
type TriggerRow = { id: string; agent_id: string; name: string; task_template: string; last_fired_at: string | null };

const field = "h-9 w-full rounded-md border border-border bg-background px-3 text-[14px] outline-none placeholder:text-faint focus:border-white/30";
const PRESETS: [string, string][] = [
  ["Every weekday at 09:00", "0 9 * * 1-5"],
  ["Every hour", "0 * * * *"],
  ["Every day at 06:00", "0 6 * * *"],
  ["Mondays at 08:00", "0 8 * * 1"],
];

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC" : "Never";

export function AutomationsLive() {
  const agents = useApi<Agent[]>("/v1/agents");
  const schedules = useApi<ScheduleRow[]>("/v1/schedules");
  const triggers = useApi<TriggerRow[]>("/v1/triggers");

  if (agents.live === false) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
        <p className="font-serif text-[26px] text-foreground">Runs that start themselves.</p>
        <p className="mx-auto mt-2 max-w-[48ch] text-[14.5px] text-muted-foreground">
          Put an agent on a schedule, or give it a url that starts a run when GitHub, a form or your own code posts to it. Connect the api to set these up.
        </p>
      </div>
    );
  }
  if (!agents.data) return <div className="h-48 animate-pulse rounded-xl border border-border" />;
  const names = Object.fromEntries(agents.data.map((a) => [a.id, a.name]));

  return (
    <div className="space-y-12">
      <Section icon={<CalendarClock className="size-4" />} title="Schedules" sub="Cron in UTC. Each due time starts exactly one run, however many workers are up.">
        <NewSchedule agents={agents.data} onDone={schedules.reload} />
        <List empty="No schedules yet.">
          {schedules.data?.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] text-foreground">{s.name}</p>
                <p className="truncate text-[13px] text-muted-foreground">
                  <Mono className="text-ink-2">{s.cron}</Mono> · {names[s.agent_id] ?? s.agent_id} · {s.task}
                </p>
              </div>
              <span className="text-[12.5px] text-muted-foreground">{s.enabled ? `Next ${when(s.next_run_at)}` : "Paused"}</span>
              {s.last_run_id && s.last_run_id !== "pending" && (
                <Link href={`/app/runs/${s.last_run_id}`} className="text-[12.5px] text-ink-2 underline decoration-border underline-offset-4">Last run</Link>
              )}
              <Button size="sm" variant="ghost" onClick={async () => { await send("PATCH", `/v1/schedules/${s.id}`, { enabled: !s.enabled }); schedules.reload(); }}>
                {s.enabled ? "Pause" : "Resume"}
              </Button>
              <Button size="sm" variant="ghost" aria-label={`Delete ${s.name}`} onClick={async () => { await send("DELETE", `/v1/schedules/${s.id}`); schedules.reload(); }}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </List>
      </Section>

      <Section icon={<Webhook className="size-4" />} title="Triggers" sub="A secret url per trigger. POST JSON to it and {fields} in the task fill from the body.">
        <NewTrigger agents={agents.data} onDone={triggers.reload} />
        <List empty="No triggers yet.">
          {triggers.data?.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] text-foreground">{t.name}</p>
                <p className="truncate text-[13px] text-muted-foreground">{names[t.agent_id] ?? t.agent_id} · {t.task_template}</p>
              </div>
              <span className="text-[12.5px] text-muted-foreground">Last fired {when(t.last_fired_at)}</span>
              <Button size="sm" variant="ghost" aria-label={`Delete ${t.name}`} onClick={async () => { await send("DELETE", `/v1/triggers/${t.id}`); triggers.reload(); }}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </List>
      </Section>
    </div>
  );
}

function Section({ icon, title, sub, children }: { icon: ReactNode; title: string; sub: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-[15px] font-medium text-foreground">{icon} {title}</h2>
      <p className="mb-4 mt-1 text-[13.5px] text-muted-foreground">{sub}</p>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function List({ empty, children }: { empty: string; children: ReactNode }) {
  const has = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {has ? children : <p className="px-4 py-6 text-center text-[13.5px] text-muted-foreground">{empty}</p>}
    </div>
  );
}

function AgentPick({ agents, value, onChange }: { agents: Agent[]; value: string; onChange: (v: string) => void }) {
  return (
    <select required value={value} onChange={(e) => onChange(e.target.value)} className={field}>
      <option value="" disabled>Pick an agent</option>
      {agents.map((a) => (
        <option key={a.id} value={a.id}>{a.name}</option>
      ))}
    </select>
  );
}

function NewSchedule({ agents, onDone }: { agents: Agent[]; onDone: () => void }) {
  const [f, setF] = useState({ agent_id: "", name: "", cron: PRESETS[0][1], task: "" });
  const [problem, setProblem] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = await send("POST", "/v1/schedules", f);
    setProblem(err);
    if (!err) {
      setF({ ...f, name: "", task: "" });
      onDone();
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
      <label><span className="mb-1.5 block text-[13px] text-ink-2">Agent</span><AgentPick agents={agents} value={f.agent_id} onChange={(v) => setF({ ...f, agent_id: v })} /></label>
      <label><span className="mb-1.5 block text-[13px] text-ink-2">Name</span><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Morning digest" className={field} /></label>
      <label>
        <span className="mb-1.5 block text-[13px] text-ink-2">When</span>
        <div className="flex gap-2">
          <select value={PRESETS.find((p) => p[1] === f.cron)?.[1] ?? ""} onChange={(e) => e.target.value && setF({ ...f, cron: e.target.value })} className={field}>
            {PRESETS.map(([label, cron]) => (<option key={cron} value={cron}>{label}</option>))}
            <option value="">Custom</option>
          </select>
          <input value={f.cron} onChange={(e) => setF({ ...f, cron: e.target.value })} aria-label="Cron expression" className={`${field} w-40 font-mono text-[13px]`} />
        </div>
      </label>
      <label><span className="mb-1.5 block text-[13px] text-ink-2">Task</span><input required value={f.task} onChange={(e) => setF({ ...f, task: e.target.value })} placeholder="Summarise yesterday's support threads" className={field} /></label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button variant="primary" type="submit"><Plus className="size-3.5" /> Add schedule</Button>
        {problem && <span className="text-[13px] text-st-failed">{problem}</span>}
      </div>
    </form>
  );
}

function NewTrigger({ agents, onDone }: { agents: Agent[]; onDone: () => void }) {
  const [f, setF] = useState({ agent_id: "", name: "", task_template: "" });
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch("/api/keel/v1/triggers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return setProblem(body.detail ?? "Couldn't create the trigger.");
    setProblem(null);
    setUrl(body.url);
    setCopied(false);
    setF({ ...f, name: "", task_template: "" });
    onDone();
  };
  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
        <label><span className="mb-1.5 block text-[13px] text-ink-2">Agent</span><AgentPick agents={agents} value={f.agent_id} onChange={(v) => setF({ ...f, agent_id: v })} /></label>
        <label><span className="mb-1.5 block text-[13px] text-ink-2">Name</span><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="New GitHub issues" className={field} /></label>
        <label className="sm:col-span-2"><span className="mb-1.5 block text-[13px] text-ink-2">Task</span><input required value={f.task_template} onChange={(e) => setF({ ...f, task_template: e.target.value })} placeholder="Triage issue #{issue.number}: {issue.title}" className={`${field} font-mono text-[13px]`} /></label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button variant="primary" type="submit"><Plus className="size-3.5" /> Create trigger</Button>
          {problem && <span className="text-[13px] text-st-failed">{problem}</span>}
        </div>
      </form>
      {url && (
        <div className="rounded-lg border border-border p-4">
          <p className="text-[14px] font-medium text-foreground">Copy this url now. It won&apos;t be shown again.</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Anyone holding it can start runs, so treat it like a password.</p>
          <div className="mt-3 flex items-center gap-2 rounded-md bg-wash px-3 py-2">
            <Mono className="min-w-0 flex-1 break-all text-foreground">{url}</Mono>
            <Button size="sm" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); }}><Copy className="size-3.5" /> {copied ? "Copied" : "Copy"}</Button>
          </div>
          <pre className="mt-3 overflow-x-auto rounded-md bg-wash px-3 py-2 font-mono text-[12px] text-ink-2">{`curl -X POST '${url}' \\\n  -H 'content-type: application/json' \\\n  -d '{"issue": {"number": 42, "title": "Crash on start"}}'`}</pre>
        </div>
      )}
    </div>
  );
}
