import type { Metadata } from "next";
import { KeysTable } from "@/components/app/keys-table";
import { PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "API keys" };

export default function KeysPage() {
  return (
    <>
      <PageHeader title="API keys" sub="Keys belong to this org and carry one role. Use them from the SDKs, the CLI, or curl." />
      <div className="px-6 py-6 lg:px-10">
        <KeysTable />
      </div>
    </>
  );
}
