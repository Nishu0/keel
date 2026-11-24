import type { Metadata } from "next";
import { Suspense } from "react";
import { NewRunButton } from "@/components/app/new-run";
import { PageHeader } from "@/components/app/page-header";
import { RunsTable } from "@/components/app/runs-table";
import { usd } from "@/lib/format";
import { runs } from "@/lib/mock";

export const metadata: Metadata = { title: "Runs" };

export default function RunsPage() {
  const today = runs.filter((r) => Date.parse(r.created_at) > Date.parse("2026-11-24T00:00:00Z"));
  const spend = today.reduce((s, r) => s + r.usage.cost_usd, 0);
  return (
    <>
      <PageHeader
        title="Runs"
        sub={<span className="tnum">{today.length} runs today, {usd(spend)} spent</span>}
        actions={
          <Suspense fallback={null}>
            <NewRunButton />
          </Suspense>
        }
      />
      <Suspense fallback={<div className="h-12 border-b border-rule" />}>
        <RunsTable />
      </Suspense>
    </>
  );
}
