import type { Metadata } from "next";
import { MobileNav, Sidebar } from "@/components/app/sidebar";

export const metadata: Metadata = { title: { default: "Runs", template: "%s · keel" } };

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <div className="flex min-h-dvh bg-paper">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <MobileNav />
        {children}
      </div>
    </div>
  );
}
