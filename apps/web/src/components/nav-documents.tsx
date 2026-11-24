"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cx, isLive, statusColor, statusLabel } from "@/lib/format"
import type { RunStatus } from "@/lib/types"

/** Recent runs in the sidebar, each with its live status. */
export function NavDocuments({
  items,
}: {
  items: { id: string; name: string; status: RunStatus; when: string }[]
}) {
  const path = usePathname()
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Recent runs</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((r) => {
          const attention = r.status === "needs_review" || r.status === "waiting_for_approval"
          return (
            <SidebarMenuItem key={r.id}>
              <SidebarMenuButton asChild size="lg" isActive={path === `/app/runs/${r.id}`} className="h-auto py-2">
                <Link href={`/app/runs/${r.id}`}>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
                    <i
                      className={cx("size-2 rounded-full", isLive(r.status) && "animate-pulse-dot")}
                      style={{ background: statusColor[r.status] }}
                    />
                  </span>
                  <span className="grid min-w-0 leading-tight">
                    <span className="truncate">{r.name}</span>
                    <span className="truncate text-xs">
                      <span
                        style={attention ? { color: statusColor[r.status] } : undefined}
                        className={attention ? "" : "text-muted-foreground"}
                      >
                        {statusLabel[r.status]}
                      </span>
                      <span className="text-faint"> · {r.when}</span>
                    </span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
