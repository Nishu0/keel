"use client"

import * as React from "react"
import Link from "next/link"
import {
  ActivityIcon,
  BotIcon,
  ChartBarIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LockIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react"

import { Mark } from "@/components/kit"
import { NavDocuments } from "@/components/nav-documents"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { ago } from "@/lib/format"
import { agentById, me, org, runs } from "@/lib/mock"

const live = runs.filter((r) => r.status === "running" || r.status === "waiting").length

const navMain = [
  { title: "Overview", url: "/app", icon: <LayoutDashboardIcon />, exact: true },
  { title: "Runs", url: "/app/runs", icon: <ActivityIcon />, badge: live || undefined },
  { title: "Agents", url: "/app/agents", icon: <BotIcon /> },
  { title: "Tools", url: "/app/tools", icon: <WrenchIcon /> },
  { title: "Usage", url: "/app/usage", icon: <ChartBarIcon /> },
]

const settings = [
  { title: "Members", url: "/app/settings/members", icon: <UsersIcon /> },
  { title: "API keys", url: "/app/settings/keys", icon: <KeyRoundIcon /> },
  { title: "Secrets", url: "/app/settings/secrets", icon: <LockIcon /> },
]

const recent = [...runs]
  .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  .slice(0, 5)
  .map((r) => ({ id: r.id, name: agentById(r.agent_id)?.name ?? r.agent_id, status: r.status, when: ago(r.created_at) }))

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" className="data-[slot=sidebar-menu-button]:p-1.5!">
              <Link href="/app">
                <Mark className="size-7! shrink-0" />
                <span className="grid leading-tight">
                  <span className="text-base font-semibold">{org.name}</span>
                  <span className="text-xs capitalize text-muted-foreground">{org.plan} plan</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavDocuments items={recent} />
        <NavSecondary label="Settings" items={settings} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={{ name: me.name, email: "owner · halyard.dev", avatar: "" }} />
      </SidebarFooter>
    </Sidebar>
  )
}
