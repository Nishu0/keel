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
import { ago, cx, isLive, statusColor, statusLabel } from "@/lib/format"
import { useApi, useNow } from "@/lib/live"
import { idTime } from "@/lib/overview"
import type { RunStatus } from "@/lib/types"

/** Recent runs in the sidebar, each with its live status. */
type Item = { id: string; name: string; status: RunStatus; when: string }

export function NavDocuments({ demo }: { demo: Item[] }) {
  const path = usePathname()
  const now = useNow()
  const runs = useApi<{ id: string; agent_id: string; status: RunStatus }[]>("/v1/runs?limit=5")
  const agents = useApi<{ id: string; name: string }[]>("/v1/agents")
  const names = Object.fromEntries((agents.data ?? []).map((a) => [a.id, a.name]))
  const items: Item[] = runs.data
    ? runs.data.map((r) => ({ id: r.id, name: names[r.agent_id] ?? r.agent_id, status: r.status, when: ago(new Date(idTime(r.id)).toISOString(), now) }))
    : demo
  if (runs.live && items.length === 0) return null
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
