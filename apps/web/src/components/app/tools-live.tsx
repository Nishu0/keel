"use client";

import { FlaskConical, Plug, Plus, Trash2, Webhook } from "lucide-react";
import { useState, type ReactNode } from "react";
import { send, useApi } from "@/lib/live";
import { useMe } from "@/lib/me";
import type { Effect } from "@/lib/types";
import { Button, EffectTag, Mono } from "../kit";
import { Json } from "./json";

type OrgTool = {
  id: string;
  name: string;
  kind: "webhook" | "mcp";
  description: string;
  effect: Effect;
  url: string;
  server: string | null;
  reconcile_url: string | null;
  input_schema: Record<string, unknown>;
};
type ToolsData = { builtin: { name: string; effect: Effect; description: string }[]; org: OrgTool[] };

const field = "h-9 w-full rounded-md border border-border bg-background px-3 text-[14px] outline-none placeholder:text-faint focus:border-white/30";

export function ToolsLive({ demo }: { demo: ReactNode }) {
  const { data, live, error, reload } = useApi<ToolsData>("/v1/tools");
  const me = useMe();
  const admin = me.role === "owner" || me.role === "admin";
  const [adding, setAdding] = useState<"mcp" | "webhook" | null>(null);

  if (live === null) return <div className="h-40 animate-pulse rounded-lg border border-border" />;
  if (live === false) return <>{demo}</>;
  if (error || !data) return <p className="text-[14px] text-muted-foreground">{error}</p>;

  const servers = [...new Set(data.org.filter((t) => t.kind === "mcp").map((t) => t.server ?? ""))];
  const webhooks = data.org.filter((t) => t.kind === "webhook");

  return (
    <div className="space-y-10">
      {admin && (
        <div className="flex flex-wrap gap-2">
          <Button variant={adding === "mcp" ? "primary" : "secondary"} onClick={() => setAdding(adding === "mcp" ? null : "mcp")}>
            <Plug className="size-3.5" /> Connect MCP server
          </Button>
          <Button variant={adding === "webhook" ? "primary" : "secondary"} onClick={() => setAdding(adding === "webhook" ? null : "webhook")}>
            <Webhook className="size-3.5" /> Add webhook
          </Button>
        </div>
      )}
      {adding === "mcp" && <ConnectMcp onDone={() => { setAdding(null); reload(); }} />}
      {adding === "webhook" && <AddWebhook onDone={() => { setAdding(null); reload(); }} />}

      {servers.map((server) => (
        <Group
          key={server}
          title={`MCP · ${server}`}
          action={
            admin && (
              <Button size="sm" variant="ghost" onClick={async () => { await send("DELETE", `/v1/tools/mcp/${server}`); reload(); }}>
                Disconnect
              </Button>
            )
          }
        >
          {data.org.filter((t) => t.server === server).map((t) => (
            <ToolRow key={t.id} t={t} admin={admin} onChange={reload} />
          ))}
        </Group>
      ))}

      {webhooks.length > 0 && (
        <Group title="Webhooks">
          {webhooks.map((t) => (
            <ToolRow key={t.id} t={t} admin={admin} onChange={reload} />
          ))}
        </Group>
      )}

      {data.org.length === 0 && !adding && (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-serif text-[24px] text-foreground">Bring your own tools.</p>
          <p className="mx-auto mt-2 max-w-[50ch] text-[14.5px] text-muted-foreground">
            Connect an MCP server and keel lists its tools, or add an https webhook that keel signs on every call. Agents pick
            from these next to the builtins below.
          </p>
        </div>
      )}

      <Group title="Built in">
        {data.builtin.map((t) => (
          <div key={t.name} className="flex items-center gap-3 px-4 py-3">
            <Mono className="text-foreground">{t.name}</Mono>
            <EffectTag effect={t.effect} />
            <span className="truncate text-[13px] text-muted-foreground">{t.description}</span>
          </div>
        ))}
      </Group>
    </div>
  );
}

function Group({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center">
        <h2 className="text-[13px] text-muted-foreground">{title}</h2>
        <div className="ml-auto">{action}</div>
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">{children}</div>
    </section>
  );
}

function ToolRow({ t, admin, onChange }: { t: OrgTool; admin: boolean; onChange: () => void }) {
  const [testing, setTesting] = useState(false);
  const [input, setInput] = useState("{}");
  const [result, setResult] = useState<{ ok: boolean; output?: unknown; error?: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const run = async () => {
    setProblem(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(input || "{}");
    } catch {
      return setProblem("Input isn't valid JSON.");
    }
    if (t.effect === "external" && !window.confirm(`${t.name} touches the real world. Call it once for real?`)) return;
    const r = await fetch(`/api/keel/v1/tools/${t.id}/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: parsed }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return setProblem(typeof body.detail === "string" ? body.detail : `Request failed (${r.status})`);
    setResult(body);
  };

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Mono className="text-foreground">{t.name}</Mono>
        {admin ? (
          <select
            value={t.effect}
            aria-label={`Effect level for ${t.name}`}
            onChange={async (e) => { setProblem(await send("PATCH", `/v1/tools/${t.id}`, { effect: e.target.value })); onChange(); }}
            className="h-6 rounded-full border border-border bg-background px-2 text-[12px]"
          >
            <option value="pure">pure</option>
            <option value="sandboxed">sandboxed</option>
            <option value="external">external</option>
          </select>
        ) : (
          <EffectTag effect={t.effect} />
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{t.description || t.url}</span>
        {admin && (
          <>
            <Button size="sm" variant="ghost" onClick={() => setTesting((x) => !x)}>
              <FlaskConical className="size-3.5" /> Test
            </Button>
            {t.kind === "webhook" && (
              <Button size="sm" variant="ghost" aria-label={`Remove ${t.name}`} onClick={async () => { await send("DELETE", `/v1/tools/${t.id}`); onChange(); }}>
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </>
        )}
      </div>
      {t.kind === "webhook" && t.effect === "external" && !t.reconcile_url && (
        <p className="mt-1 text-[12.5px] text-st-review">No reconcile url: an in doubt call waits for a person.</p>
      )}
      {testing && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-[12px] text-muted-foreground">Input</p>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={4} className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[12.5px] outline-none focus:border-white/30" />
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" variant="primary" onClick={run}>Call once</Button>
              {problem && <span className="text-[12.5px] text-st-failed">{problem}</span>}
            </div>
          </div>
          <div>
            <p className="mb-1 text-[12px] text-muted-foreground">Result</p>
            {result ? (
              <Json value={result.ok ? result.output : result.error} className={`rounded-md px-3 py-2 ${result.ok ? "bg-wash" : "bg-[color-mix(in_oklab,var(--st-failed)_8%,transparent)]"}`} />
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-2 text-[12.5px] text-faint">Nothing yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectMcp({ onDone }: { onDone: () => void }) {
  const [server, setServer] = useState("");
  const [url, setUrl] = useState("");
  const [auth, setAuth] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const err = await send("POST", "/v1/tools/mcp", { server, url, auth_secret: auth || null });
    setBusy(false);
    if (err) return setProblem(err);
    onDone();
  };
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-[180px_1fr_200px_auto] sm:items-end">
      <label><span className="mb-1.5 block text-[13px] text-ink-2">Short name</span><input required value={server} onChange={(e) => setServer(e.target.value.toLowerCase())} placeholder="github" className={field} /></label>
      <label><span className="mb-1.5 block text-[13px] text-ink-2">Server url</span><input required type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.example.com/mcp" className={field} /></label>
      <label><span className="mb-1.5 block text-[13px] text-ink-2">Auth secret (optional)</span><input value={auth} onChange={(e) => setAuth(e.target.value.toUpperCase())} placeholder="GITHUB_MCP_TOKEN" className={`${field} font-mono text-[13px]`} /></label>
      <Button variant="primary" type="submit" disabled={busy}>{busy ? "Listing tools" : "Connect"}</Button>
      <p className="text-[12.5px] text-muted-foreground sm:col-span-4">
        keel lists the server&apos;s tools now. Tools it marks read only start as pure; the rest start as external.
        {problem && <span className="ml-2 text-st-failed">{problem}</span>}
      </p>
    </form>
  );
}

function AddWebhook({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: "", url: "", description: "", signing_secret: "", reconcile_url: "", effect: "external", schema: '{\n  "type": "object",\n  "properties": {}\n}' });
  const [problem, setProblem] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let input_schema: unknown;
    try {
      input_schema = JSON.parse(form.schema);
    } catch {
      return setProblem("Input schema isn't valid JSON.");
    }
    const err = await send("POST", "/v1/tools/webhook", {
      name: form.name,
      url: form.url,
      description: form.description,
      signing_secret: form.signing_secret,
      reconcile_url: form.reconcile_url || null,
      effect: form.effect,
      input_schema,
    });
    if (err) return setProblem(err);
    onDone();
  };
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
      <label><span className="mb-1.5 block text-[13px] text-ink-2">Tool name</span><input required value={form.name} onChange={set("name")} placeholder="place_order" className={`${field} font-mono text-[13px]`} /></label>
      <label><span className="mb-1.5 block text-[13px] text-ink-2">https url</span><input required type="url" value={form.url} onChange={set("url")} placeholder="https://desk.example.com/keel/place_order" className={field} /></label>
      <label className="sm:col-span-2"><span className="mb-1.5 block text-[13px] text-ink-2">What it does (the model reads this)</span><input value={form.description} onChange={set("description")} placeholder="Place a limit order on the desk." className={field} /></label>
      <label><span className="mb-1.5 block text-[13px] text-ink-2">Signing secret name</span><input required value={form.signing_secret} onChange={set("signing_secret")} placeholder="DESK_SIGNING" className={`${field} font-mono text-[13px] uppercase`} /></label>
      <label><span className="mb-1.5 block text-[13px] text-ink-2">Effect</span>
        <select value={form.effect} onChange={set("effect")} className={field}>
          <option value="pure">pure: reads only</option>
          <option value="external">external: touches the real world</option>
        </select>
      </label>
      <label className="sm:col-span-2"><span className="mb-1.5 block text-[13px] text-ink-2">Reconcile url (optional, external only)</span><input type="url" value={form.reconcile_url} onChange={set("reconcile_url")} placeholder="https://desk.example.com/keel/place_order/status" className={field} /></label>
      <label className="sm:col-span-2"><span className="mb-1.5 block text-[13px] text-ink-2">Input schema (JSON Schema)</span><textarea value={form.schema} onChange={set("schema")} rows={5} className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[12.5px] outline-none focus:border-white/30" /></label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button variant="primary" type="submit"><Plus className="size-3.5" /> Add webhook</Button>
        {problem && <span className="text-[13px] text-st-failed">{problem}</span>}
      </div>
    </form>
  );
}
