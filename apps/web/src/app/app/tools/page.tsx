import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Button, EffectTag, Mono } from "@/components/kit";
import { agents, tools } from "@/lib/mock";
import type { Tool } from "@/lib/types";

export const metadata: Metadata = { title: "Tools" };

const KIND: Record<Tool["kind"], string> = {
  builtin: "Built in",
  sandbox: "Sandbox",
  webhook: "Webhook",
  mcp: "MCP server",
};

export default function ToolsPage() {
  const groups: Tool["kind"][] = ["webhook", "mcp", "sandbox", "builtin"];
  return (
    <>
      <PageHeader
        title="Tools"
        sub="Your own tools as HTTPS webhooks or MCP servers, plus what keel ships with."
        actions={
          <>
            <Button>Connect MCP server</Button>
            <Button variant="primary"><Plus className="size-3.5" /> Add webhook</Button>
          </>
        }
      />
      <div className="px-6 py-6 lg:px-10">
        {groups.map((g) => {
          const list = tools.filter((t) => t.kind === g);
          if (!list.length) return null;
          return (
            <section key={g} className="mb-10">
              <h2 className="mb-3 text-[13px] text-muted-foreground">{KIND[g]}</h2>
              <div className="overflow-hidden rounded-lg border border-rule-strong bg-raised">
                <table className="w-full text-left text-[13.5px]">
                  <tbody className="divide-y divide-rule">
                    {list.map((t) => {
                      const usedBy = agents.filter((a) => a.tools.includes(t.id));
                      return (
                        <tr key={t.id} className="align-top">
                          <td className="w-[34%] px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <Mono className="text-ink">{t.name}</Mono>
                              <EffectTag effect={t.effect} />
                            </div>
                            <p className="mt-1 text-[12.5px] text-muted-foreground">{t.description}</p>
                          </td>
                          <td className="hidden px-4 py-3.5 text-[12.5px] text-muted-foreground md:table-cell">
                            {t.url ? <Mono className="break-all text-ink-2">{t.url}</Mono> : <span>Runs inside keel</span>}
                            {t.effect === "external" && (
                              <p className="mt-1">
                                {t.reconcile ? (
                                  <span className="text-ink-2">Reconcile hook set. In doubt calls get checked.</span>
                                ) : (
                                  <span className="text-st-review">No reconcile hook. In doubt calls wait for a person.</span>
                                )}
                              </p>
                            )}
                          </td>
                          <td className="tnum hidden whitespace-nowrap px-4 py-3.5 text-right text-[12.5px] text-muted-foreground lg:table-cell">
                            {t.timeout_s}s timeout
                          </td>
                          <td className="px-4 py-3.5 text-right text-[12.5px] text-muted-foreground">
                            {usedBy.length ? usedBy.map((a) => a.name).join(", ") : "Unused"}
                          </td>
                          <td className="w-20 px-4 py-3 text-right">
                            {(t.kind === "webhook" || t.kind === "mcp") && <Button size="sm" variant="ghost">Test</Button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
        <p className="max-w-[70ch] text-[13px] leading-[1.6] text-muted-foreground">
          Webhook calls are signed with your org&apos;s HMAC secret and carry an <Mono className="text-ink-2">Idempotency-Key</Mono> equal to the
          call id. The same logical call always sends the same key, across retries and worker restarts.
        </p>
      </div>
    </>
  );
}
