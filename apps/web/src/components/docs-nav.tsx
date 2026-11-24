"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS } from "@/lib/docs";
import { cx } from "@/lib/format";

export function DocsNav() {
  const path = usePathname();
  const groups = [...new Set(DOCS.map((d) => d.group))];
  return (
    <nav aria-label="Docs" className="md:sticky md:top-24 md:self-start">
      {groups.map((g) => (
        <div key={g} className="mb-6">
          <p className="mb-1.5 text-[13px] text-muted-foreground">{g}</p>
          <ul>
            {DOCS.filter((d) => d.group === g).map((d) => {
              const on = path === `/docs/${d.slug}`;
              return (
                <li key={d.slug}>
                  <Link href={`/docs/${d.slug}`} aria-current={on ? "page" : undefined} className={cx("-ml-2.5 block rounded-md px-2.5 py-1 text-[14.5px] transition-colors", on ? "bg-white/[0.06] text-foreground" : "text-ink-2 hover:text-foreground")}>
                    {d.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
