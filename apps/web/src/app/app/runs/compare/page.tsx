import type { Metadata } from "next";
import { Suspense } from "react";
import { CompareView } from "@/components/app/compare-view";
import { PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Compare runs" };

export default function ComparePage() {
  return (
    <>
      <PageHeader title="Compare runs" sub="Two runs side by side, step by step, with the first place they part ways." />
      <div className="px-6 py-6 lg:px-10">
        <Suspense fallback={<div className="h-64 rounded-xl border border-border" />}>
          <CompareView />
        </Suspense>
      </div>
    </>
  );
}
