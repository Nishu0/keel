"use client"

import * as React from "react"
import {
  ActivityIcon,
  BotIcon,
  ChartBarIcon,
  CreditCardIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LockIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react"

import { NavDocuments } from "@/components/nav-documents"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import { OrgSwitcher } from "@/components/org-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"
import { ago } from "@/lib/format"
import { useApi } from "@/lib/live"
import { agentById, runs } from "@/lib/mock"

const demoRunning = runs.filter((r) => r.status === "running" || r.status === "waiting").length

const navMain = [
  { title: "Overview", url: "/app", icon: <LayoutDashboardIcon />, exact: true },
  { title: "Runs", url: "/app/runs", icon: <ActivityIcon /> },
  { title: "Agents", url: "/app/agents", icon: <BotIcon /> },
  { title: "Tools", url: "/app/tools", icon: <WrenchIcon /> },
  { title: "Usage", url: "/app/usage", icon: <ChartBarIcon /> },
]

const settings = [
  { title: "Billing", url: "/app/settings/billing", icon: <CreditCardIcon /> },
  { title: "Members", url: "/app/settings/members", icon: <UsersIcon /> },
  { title: "API keys", url: "/app/settings/keys", icon: <KeyRoundIcon /> },
  { title: "Secrets", url: "/app/settings/secrets", icon: <LockIcon /> },
]

const recent = [...runs]
  .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  .slice(0, 5)
  .map((r) => ({ id: r.id, name: agentById(r.agent_id)?.name ?? r.agent_id, status: r.status, when: ago(r.created_at) }))

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const live = useApi<{ status: string }[]>("/v1/runs?status=running&limit=200")
  const running = live.live ? (live.data?.length ?? 0) : demoRunning
  const items = navMain.map((n) => (n.url === "/app/runs" && running ? { ...n, badge: running } : n))
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <OrgSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={items} />
        <NavDocuments demo={recent} />
        <NavSecondary label="Settings" items={settings} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
