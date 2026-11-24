import { Suspense } from "react";
import { DocsNav } from "@/components/docs-nav";
import { Nav } from "@/components/landing/nav";

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <>
      <Nav />
      <div className="mx-auto grid max-w-[1240px] gap-10 px-5 pb-24 pt-8 sm:px-8 md:grid-cols-[200px_minmax(0,1fr)]">
        <Suspense fallback={<div />}>
          <DocsNav />
        </Suspense>
        <main id="main" className="min-w-0">{children}</main>
      </div>
    </>
  );
}
