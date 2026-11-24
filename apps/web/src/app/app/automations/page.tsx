import type { Metadata } from "next";
import { AutomationsLive } from "@/components/app/automations-live";
import { PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Automations" };

export default function AutomationsPage() {
  return (
    <>
      <PageHeader title="Automations" sub="Start runs on a schedule, or from anything that can send an http request." />
      <div className="px-6 py-6 lg:px-10">
        <AutomationsLive />
      </div>
    </>
  );
}
