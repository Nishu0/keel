"use client";

import { Activity, Bot, ChevronsUpDown, FileClock, KeyRound, Lock, Search, Users, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/format";
import { me, org, runs } from "@/lib/mock";
import { Avatar, Kbd, Mark } from "../ui";

type Item = { href: string; label: string; icon: LucideIcon; count?: number };

const live = runs.filter((r) => r.status === "running" || r.status === "waiting").length;
const attention = runs.filter((r) => r.status === "needs_review" || r.status === "waiting_for_approval").length;

const main: Item[] = [
  { href: "/app/runs", label: "Runs", icon: Activity, count: live },
  { href: "/app/agents", label: "Agents", icon: Bot },
  { href: "/app/tools", label: "Tools", icon: Wrench },
  { href: "/app/usage", label: "Usage", icon: FileClock },
];

const settings: Item[] = [
  { href: "/app/settings/members", label: "Members", icon: Users },
  { href: "/app/settings/keys", label: "API keys", icon: KeyRound },
  { href: "/app/settings/secrets", label: "Secrets", icon: Lock },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-rule bg-surface md:flex">
      <button className="mx-2 mt-2 flex items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-wash">
        <span className="flex size-6 items-center justify-center rounded-md bg-ink text-paper">
          <Mark className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-ink">{org.name}</span>
          <span className="block text-[11.5px] capitalize text-muted">{org.plan} plan</span>
        </span>
        <ChevronsUpDown className="size-3.5 text-faint" />
      </button>

      <div className="mx-3 mt-2 flex h-8 items-center gap-2 rounded-md border border-rule bg-raised px-2.5 text-[13px] text-faint">
        <Search className="size-3.5" />
        <span className="flex-1">Jump to</span>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </div>

      {attention > 0 && (
        <Link
          href="/app/runs?status=attention"
          className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-[color-mix(in_oklab,var(--st-review)_30%,transparent)] bg-[color-mix(in_oklab,var(--st-review)_7%,transparent)] px-2.5 py-2 text-[12.5px] text-ink hover:bg-[color-mix(in_oklab,var(--st-review)_11%,transparent)]"
        >
          <i className="size-1.5 animate-pulse-dot rounded-full bg-st-review" />
          {attention} runs need a decision
        </Link>
      )}

      <Nav items={main} path={path} className="mt-4" />
      <p className="mx-5 mb-1 mt-6 text-[12px] text-faint">Settings</p>
      <Nav items={settings} path={path} />

      <div className="mt-auto flex items-center gap-2.5 border-t border-rule px-4 py-3">
        <Avatar name={me.name} className="size-6 text-[10px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-ink">{me.name}</span>
          <span className="block text-[11.5px] capitalize text-muted">{me.role}</span>
        </span>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const path = usePathname();
  return (
    <div className="sticky top-0 z-20 border-b border-rule bg-surface/95 backdrop-blur md:hidden">
      <div className="flex h-12 items-center gap-2.5 px-4">
        <span className="flex size-6 items-center justify-center rounded-md bg-ink text-paper">
          <Mark className="size-3.5" />
        </span>
        <span className="text-[13.5px] font-medium text-ink">{org.name}</span>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
        {[...main, ...settings].map(({ href, label }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cx("h-7 shrink-0 rounded-md px-2.5 text-[13px] leading-7", active ? "bg-wash font-medium text-ink" : "text-muted")}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Nav({ items, path, className }: { items: Item[]; path: string; className?: string }) {
  return (
    <nav className={cx("flex flex-col gap-px px-2", className)}>
      {items.map(({ href, label, icon: Icon, count }) => {
        const active = path === href || path.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-colors",
              active ? "bg-wash font-medium text-ink" : "text-ink-2 hover:bg-wash hover:text-ink",
            )}
          >
            <Icon className={cx("size-4", active ? "text-ink" : "text-muted")} strokeWidth={1.8} />
            <span className="flex-1">{label}</span>
            {!!count && (
              <span className="tnum inline-flex items-center gap-1 text-[12px] text-muted">
                <i className="size-1.5 animate-pulse-dot rounded-full bg-st-running" />
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
