import { Lock } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { SecretsLive } from "@/components/app/settings-live";
import { Button, Mono } from "@/components/kit";

export const metadata: Metadata = { title: "Secrets" };

const secrets = [
  { name: "ANTHROPIC_API_KEY", used: "trading-agent, research-agent", by: "Ana Ruiz", updated: "Nov 2" },
  { name: "OPENAI_API_KEY", used: "inbox-triage", by: "Sam Okafor", updated: "Oct 28" },
  { name: "DESK_WEBHOOK_SIGNING", used: "place_order, get_orderbook", by: "Ana Ruiz", updated: "Oct 14" },
  { name: "SLACK_BOT_TOKEN", used: "send_slack", by: "Ira Menon", updated: "Sep 30" },
];

export default function SecretsPage() {
  return (
    <>
      <PageHeader
        title="Secrets"
        sub="Values are write only. They're decrypted inside the worker just before use and never land in events or logs."
      />
      <div className="px-6 py-6 lg:px-10">
        <SecretsLive
          demo={
        <div className="overflow-hidden rounded-lg border border-rule-strong bg-raised">
          <table className="w-full text-left text-[13.5px]">
            <thead className="text-[12.5px] text-muted-foreground">
              <tr className="border-b border-rule">
                <th className="px-4 py-2 font-normal">Name</th>
                <th className="hidden px-4 py-2 font-normal md:table-cell">Used by</th>
                <th className="hidden px-4 py-2 font-normal sm:table-cell">Updated</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {secrets.map((s) => (
                <tr key={s.name}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <Lock className="size-3.5 text-faint" />
                      <Mono className="text-ink">{s.name}</Mono>
                    </span>
                    <span className="mt-1 block pl-[22px] font-mono text-[12px] tracking-widest text-faint">••••••••••••</span>
                  </td>
                  <td className="hidden px-4 py-3 text-ink-2 md:table-cell">{s.used}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{s.updated} by {s.by}</td>
                  <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost">Replace</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          }
        />
        <p className="mt-4 max-w-[70ch] text-[13px] text-muted-foreground">
          Each org has its own data key, derived from the master key (AWS KMS when hosted). Secrets are sealed with AES-GCM under that key, bound to the org and the secret name. Event payloads pass through a redactor that
          masks known secret values before they&apos;re stored.
        </p>
      </div>
    </>
  );
}
