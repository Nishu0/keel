"use client";

import { Copy, Lock, Plus, Trash2, UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { send, useApi } from "@/lib/live";
import { useMe } from "@/lib/me";
import { Avatar, Button, Mono } from "../kit";

const ROLES = ["admin", "developer", "viewer"] as const;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Never");

function Shell({ live, demo, error, children }: { live: boolean | null; demo: ReactNode; error: string | null; children: ReactNode }) {
  if (live === null) return <div className="h-40 animate-pulse rounded-lg border border-border" />;
  if (live === false) return <>{demo}</>;
  if (error) return <p className="rounded-lg border border-border px-4 py-3 text-[14px] text-muted-foreground">{error}</p>;
  return <>{children}</>;
}

function Problem({ text }: { text: string | null }) {
  return text ? <p role="alert" className="text-[13px] text-st-failed">{text}</p> : null;
}

/* ---------------- members ---------------- */

type MembersData = {
  members: { user_id: string; role: string; name: string; email: string }[];
  invites: { email: string; role: string; expires_at: string }[];
};

export function MembersLive({ demo }: { demo: ReactNode }) {
  const { data, live, error, reload } = useApi<MembersData>("/v1/members");
  const me = useMe();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("developer");
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const admin = me.role === "owner" || me.role === "admin";

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    const err = await send("POST", "/v1/members/invite", { email, role });
    if (err) return setProblem(err);
    setNote(`Invite sent to ${email}.`);
    setEmail("");
    reload();
  };

  return (
    <Shell live={live} demo={demo} error={error}>
      <div className="space-y-8">
        {admin && (
          <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
            <label className="min-w-[240px] flex-1">
              <span className="mb-1.5 block text-[13px] text-ink-2">Invite by email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-[14px] outline-none placeholder:text-faint focus:border-white/30"
              />
            </label>
            <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} aria-label="Role" className="h-9 rounded-md border border-border bg-background px-2 text-[14px] capitalize">
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <Button variant="primary" type="submit"><UserPlus className="size-3.5" /> Send invite</Button>
            <div className="basis-full">
              <Problem text={problem} />
              {note && <p className="text-[13px] text-st-completed">{note}</p>}
            </div>
          </form>
        )}

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-[14px]">
            <tbody className="divide-y divide-border">
              {data?.members.map((m) => (
                <tr key={m.user_id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name || m.email} className="size-7 text-[10.5px]" />
                      <div>
                        <p className="text-foreground">{m.name || m.email}</p>
                        <p className="text-[12.5px] text-muted-foreground">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.role === "owner" || !admin ? (
                      <span className="pr-2 text-[13px] capitalize text-ink-2">{m.role}</span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <select
                          defaultValue={m.role}
                          aria-label={`Role for ${m.email}`}
                          onChange={async (e) => {
                            const err = await send("PATCH", `/v1/members/${m.user_id}`, { role: e.target.value });
                            setProblem(err);
                            reload();
                          }}
                          className="h-7 rounded-md border border-border bg-background px-2 text-[13px] capitalize"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${m.email}`}
                          onClick={async () => {
                            setProblem(await send("DELETE", `/v1/members/${m.user_id}`));
                            reload();
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {data?.invites.map((i) => (
                <tr key={i.email} className="text-muted-foreground">
                  <td className="px-4 py-3">
                    <p>{i.email}</p>
                    <p className="text-[12.5px]">Invited, expires {when(i.expires_at)}</p>
                  </td>
                  <td className="px-4 py-3 pr-6 text-right text-[13px] capitalize">{i.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}

/* ---------------- api keys ---------------- */

type Key = { id: string; name: string; prefix: string; role: string; created_at: string; last_used_at: string | null; revoked_at: string | null };

export function KeysLive({ demo }: { demo: ReactNode }) {
  const { data, live, error, reload } = useApi<Key[]>("/v1/api-keys");
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("developer");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    const r = await fetch("/api/keel/v1/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, role }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return setProblem(body.detail ?? "Couldn't create the key.");
    setFresh(body.secret);
    setCopied(false);
    setName("");
    reload();
  };

  return (
    <Shell live={live} demo={demo} error={error}>
      <div className="space-y-6">
        <form onSubmit={create} className="flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1">
            <span className="mb-1.5 block text-[13px] text-ink-2">Key name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="CI release notes"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-[14px] outline-none placeholder:text-faint focus:border-white/30"
            />
          </label>
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} aria-label="Role" className="h-9 rounded-md border border-border bg-background px-2 text-[14px] capitalize">
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <Button variant="primary" type="submit"><Plus className="size-3.5" /> Create key</Button>
          <div className="basis-full"><Problem text={problem} /></div>
        </form>

        {fresh && (
          <div className="rounded-lg border border-border p-4">
            <p className="text-[14px] font-medium text-foreground">Copy this key now. It won&apos;t be shown again.</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">keel stores only a hash and the prefix.</p>
            <div className="mt-3 flex items-center gap-2 rounded-md bg-wash px-3 py-2">
              <Mono className="min-w-0 flex-1 break-all text-foreground">{fresh}</Mono>
              <Button size="sm" onClick={() => { navigator.clipboard?.writeText(fresh); setCopied(true); }}>
                <Copy className="size-3.5" /> {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-[14px]">
            <thead className="text-[12.5px] text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-normal">Name</th>
                <th className="px-4 py-2 font-normal">Key</th>
                <th className="px-4 py-2 font-normal">Role</th>
                <th className="hidden px-4 py-2 font-normal sm:table-cell">Last used</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No keys yet. Create one to call the api from CI or the SDKs.</td></tr>
              )}
              {data?.map((k) => (
                <tr key={k.id} className={k.revoked_at ? "opacity-50" : ""}>
                  <td className="px-4 py-2.5 text-foreground">{k.name}</td>
                  <td className="px-4 py-2.5"><Mono className="text-ink-2">{k.prefix}…</Mono></td>
                  <td className="px-4 py-2.5 capitalize text-ink-2">{k.role}</td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">{k.revoked_at ? "Revoked" : when(k.last_used_at)}</td>
                  <td className="px-4 py-2 text-right">
                    {!k.revoked_at && (
                      <Button size="sm" variant="ghost" onClick={async () => { setProblem(await send("DELETE", `/v1/api-keys/${k.id}`)); reload(); }}>
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}

/* ---------------- secrets ---------------- */

type SecretRow = { id: string; name: string; created_by: string; updated_at: string };

export function SecretsLive({ demo }: { demo: ReactNode }) {
  const { data, live, error, reload } = useApi<SecretRow[]>("/v1/secrets");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = await send("POST", "/v1/secrets", { name, value });
    setProblem(err);
    if (!err) {
      setName("");
      setValue("");
      reload();
    }
  };

  return (
    <Shell live={live} demo={demo} error={error}>
      <div className="space-y-6">
        <form onSubmit={save} className="flex flex-wrap items-end gap-2">
          <label className="w-[260px]">
            <span className="mb-1.5 block text-[13px] text-ink-2">Name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ANTHROPIC_API_KEY"
              className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-[13px] uppercase outline-none placeholder:text-faint focus:border-white/30"
            />
          </label>
          <label className="min-w-[220px] flex-1">
            <span className="mb-1.5 block text-[13px] text-ink-2">Value</span>
            <input
              required
              type="password"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-[14px] outline-none focus:border-white/30"
            />
          </label>
          <Button variant="primary" type="submit"><Lock className="size-3.5" /> Save secret</Button>
          <div className="basis-full"><Problem text={problem} /></div>
        </form>
        <p className="text-[13px] text-muted-foreground">Saving a name that exists replaces its value. Values can&apos;t be read back, only replaced.</p>

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-[14px]">
            <tbody className="divide-y divide-border">
              {data?.length === 0 && (
                <tr><td className="px-4 py-8 text-center text-muted-foreground">No secrets yet. Add a model key or a webhook signing secret.</td></tr>
              )}
              {data?.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <Lock className="size-3.5 text-faint" />
                      <Mono className="text-foreground">{s.name}</Mono>
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">Updated {when(s.updated_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" aria-label={`Delete ${s.name}`} onClick={async () => { setProblem(await send("DELETE", `/v1/secrets/${s.id}`)); reload(); }}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
