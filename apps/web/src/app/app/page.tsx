import type { Metadata } from "next";
import { Suspense } from "react";
import { OverviewLive } from "@/components/app/overview-live";
import type { RunRow } from "@/components/data-table";
import { agentById, runs } from "@/lib/mock";

export const metadata: Metadata = { title: "Overview" };

const rows: RunRow[] = runs.map((r) => ({ ...r, agent_name: agentById(r.agent_id)?.name ?? r.agent_id }));

export default function Overview() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        {/* tanstack reads the clock while building the table, so this renders per request */}
        <Suspense fallback={<div className="mx-4 h-[420px] rounded-lg border lg:mx-6" />}>
          <OverviewLive demoRows={rows} />
        </Suspense>
      </div>
    </div>
  );
}
