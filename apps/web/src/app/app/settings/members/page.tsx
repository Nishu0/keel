import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { MembersLive } from "@/components/app/settings-live";
import { Avatar } from "@/components/kit";
import type { Role } from "@/lib/types";

export const metadata: Metadata = { title: "Members" };

const members: { name: string; email: string; role: Role; last: string; pending?: boolean }[] = [
  { name: "Ana Ruiz", email: "ana@halyard.dev", role: "owner", last: "Active now" },
  { name: "Ira Menon", email: "ira@halyard.dev", role: "admin", last: "12m ago" },
  { name: "Sam Okafor", email: "sam@halyard.dev", role: "developer", last: "Yesterday" },
  { name: "Lena Brandt", email: "lena@halyard.dev", role: "viewer", last: "3d ago" },
  { name: "jo@halyard.dev", email: "jo@halyard.dev", role: "developer", last: "Invite sent 2d ago", pending: true },
];

const can: [string, Role[]][] = [
  ["View agents and runs", ["owner", "admin", "developer", "viewer"]],
  ["Create and edit agents, start runs", ["owner", "admin", "developer"]],
  ["Approve or resume runs", ["owner", "admin", "developer"]],
  ["Manage tools and secrets", ["owner", "admin"]],
  ["Manage members and API keys", ["owner", "admin"]],
  ["Billing, delete org", ["owner"]],
];
const roles: Role[] = ["owner", "admin", "developer", "viewer"];

export default function MembersPage() {
  return (
    <>
      <PageHeader
        title="Members"
        sub="Who can see and run agents in this org, and what each role allows."
              />
      <div className="space-y-10 px-6 py-6 lg:px-10">
        <MembersLive
          demo={
        <div className="overflow-hidden rounded-lg border border-rule-strong bg-raised">
          <table className="w-full text-left text-[13.5px]">
            <tbody className="divide-y divide-rule">
              {members.map((m) => (
                <tr key={m.email}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name} className={`size-7 text-[10.5px] ${m.pending ? "opacity-40" : ""}`} />
                      <div>
                        <p className="text-ink">{m.pending ? "Pending invite" : m.name}</p>
                        <p className="text-[12.5px] text-muted-foreground">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-[12.5px] text-muted-foreground sm:table-cell">{m.last}</td>
                  <td className="px-4 py-3 text-right">
                    {m.role === "owner" ? (
                      <span className="pr-2 text-[13px] text-ink-2">Owner</span>
                    ) : (
                      <select defaultValue={m.role} aria-label={`Role for ${m.email}`} className="h-7 rounded-md border border-rule bg-paper px-2 text-[13px] capitalize text-ink">
                        {roles.slice(1).map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          }
        />

        <section>
          <h2 className="text-[14px] font-medium text-ink">What each role can do</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-rule">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead className="text-[12.5px] text-muted-foreground">
                <tr className="border-b border-rule">
                  <th className="px-4 py-2 text-left font-normal" />
                  {roles.map((r) => <th key={r} className="px-4 py-2 font-normal capitalize">{r}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-rule text-ink-2">
                {can.map(([action, who]) => (
                  <tr key={action}>
                    <td className="px-4 py-2">{action}</td>
                    {roles.map((r) => (
                      <td key={r} className="px-4 py-2 text-center">
                        {who.includes(r) ? <span className="text-ink" aria-label="yes">✓</span> : <span className="text-faint" aria-label="no">–</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
