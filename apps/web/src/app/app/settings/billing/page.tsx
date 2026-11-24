import type { Metadata } from "next";
import { Suspense } from "react";
import { BillingLive } from "@/components/app/billing-live";
import { PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage() {
  return (
    <>
      <PageHeader title="Billing" sub="Your plan, what you've used this month, and upgrades. Billed by Stripe on the 1st." />
      <div className="px-6 py-6 lg:px-10">
        <Suspense fallback={<div className="h-64 rounded-xl border border-border" />}>
          <BillingLive />
        </Suspense>
      </div>
    </>
  );
}
