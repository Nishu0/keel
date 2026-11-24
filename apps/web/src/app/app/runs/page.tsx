import type { Metadata } from "next";
import { Suspense } from "react";
import { NewRunButton } from "@/components/app/new-run";
import { PageHeader } from "@/components/app/page-header";
import { RunsTable } from "@/components/app/runs-table";

export const metadata: Metadata = { title: "Runs" };

export default function RunsPage() {
  return (
    <>
      <PageHeader
        title="Runs"
        sub="Every run in this org, newest first. Open one to watch it live or step through what happened."
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
