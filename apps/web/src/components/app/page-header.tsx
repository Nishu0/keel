import type { ReactNode } from "react";

export function PageHeader({ title, sub, actions, crumbs }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumbs?: ReactNode }) {
  return (
    <header className="border-b border-rule px-6 pb-5 pt-6 lg:px-10">
      {crumbs && <div className="mb-3 text-[13px] text-muted-foreground">{crumbs}</div>}
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-[34px] leading-[1.05] text-ink">{title}</h1>
          {sub && <div className="mt-2 text-[14px] text-muted-foreground">{sub}</div>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
