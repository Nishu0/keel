"use client";

import { Copy, Plus } from "lucide-react";
import { useState } from "react";
import type { Role } from "@/lib/types";
import { Button, Mono } from "../kit";

type Key = { id: string; name: string; prefix: string; role: Role; last_used: string; revoked?: boolean };

const initial: Key[] = [
  { id: "key_1", name: "CI release notes", prefix: "kl_live_ci", role: "developer", last_used: "4m ago" },
  { id: "key_2", name: "Support cron", prefix: "kl_live_cron", role: "developer", last_used: "18m ago" },
  { id: "key_3", name: "Trading desk", prefix: "kl_live_9x2c", role: "developer", last_used: "41m ago" },
  { id: "key_4", name: "Grafana reader", prefix: "kl_live_r7aa", role: "viewer", last_used: "2h ago" },
];

export function KeysTable() {
  const [keys, setKeys] = useState(initial);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = () => {
    const tail = Math.random().toString(36).slice(2, 6);
    const secret = `kl_live_${tail}${Array.from({ length: 28 }, () => "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 32)]).join("")}`;
    setKeys((k) => [{ id: `key_${tail}`, name: "New key", prefix: `kl_live_${tail}`, role: "developer", last_used: "Never" }, ...k]);
    setFresh(secret);
    setCopied(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="primary" onClick={create}><Plus className="size-3.5" /> Create key</Button>
      </div>
      {fresh && (
        <div className="rounded-lg border border-rule-strong bg-raised p-4">
          <p className="text-[14px] font-medium text-ink">Copy this key now. It won&apos;t be shown again.</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">keel stores only a hash and the prefix.</p>
          <div className="mt-3 flex items-center gap-2 rounded-md bg-wash px-3 py-2">
            <Mono className="min-w-0 flex-1 break-all text-ink">{fresh}</Mono>
            <Button size="sm" onClick={() => { navigator.clipboard?.writeText(fresh); setCopied(true); }}>
              <Copy className="size-3.5" /> {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-rule-strong bg-raised">
        <table className="w-full text-left text-[13.5px]">
          <thead className="text-[12.5px] text-muted-foreground">
            <tr className="border-b border-rule">
              <th className="px-4 py-2 font-normal">Name</th>
              <th className="px-4 py-2 font-normal">Key</th>
              <th className="px-4 py-2 font-normal">Role</th>
              <th className="hidden px-4 py-2 font-normal sm:table-cell">Last used</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {keys.map((k) => (
              <tr key={k.id} className={k.revoked ? "opacity-50" : ""}>
                <td className="px-4 py-2.5 text-ink">{k.name}</td>
                <td className="px-4 py-2.5"><Mono className="text-ink-2">{k.prefix}…</Mono></td>
                <td className="px-4 py-2.5 capitalize text-ink-2">{k.role}</td>
                <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">{k.revoked ? "Revoked" : k.last_used}</td>
                <td className="px-4 py-2 text-right">
                  {!k.revoked && (
                    <Button size="sm" variant="ghost" onClick={() => setKeys((all) => all.map((x) => (x.id === k.id ? { ...x, revoked: true } : x)))}>
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
  );
}
