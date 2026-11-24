"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CirclePlusIcon, SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: React.ReactNode
    badge?: React.ReactNode
    exact?: boolean
  }[]
}) {
  const path = usePathname()
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              asChild
              tooltip="New run"
              className="btn-sheen min-w-8 text-foreground duration-200 ease-linear hover:text-foreground active:text-foreground"
            >
              <Link href="/app/runs?new=1">
                <CirclePlusIcon />
                <span>New run</span>
              </Link>
            </SidebarMenuButton>
            <Button size="icon" className="size-8 group-data-[collapsible=icon]:opacity-0" variant="outline" asChild>
              <Link href="/app/runs">
                <SearchIcon />
                <span className="sr-only">Search runs</span>
              </Link>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {items.map((item) => {
            const active = item.exact ? path === item.url : path === item.url || path.startsWith(item.url + "/")
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={item.title} isActive={active}>
                  <Link href={item.url}>
                    {item.icon}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
                {item.badge && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
