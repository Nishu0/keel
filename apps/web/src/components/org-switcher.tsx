"use client"

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"

import { Mark } from "@/components/kit"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { switchOrg, useMe } from "@/lib/me"

export function OrgSwitcher() {
  const me = useMe()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[slot=sidebar-menu-button]:p-1.5! data-[state=open]:bg-sidebar-accent">
              <Mark className="size-7! shrink-0" />
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-base font-semibold">{me.org.name}</span>
                <span className="text-xs capitalize text-muted-foreground">{me.org.plan} plan</span>
              </span>
              <ChevronsUpDownIcon className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg" align="start" sideOffset={4}>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Orgs</DropdownMenuLabel>
            {me.orgs.map((o) => (
              <DropdownMenuItem key={o.id} onSelect={() => o.id !== me.org.id && switchOrg(o.id)} className="gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.name}</span>
                  <span className="block text-xs capitalize text-muted-foreground">
                    {o.role} · {o.plan}
                  </span>
                </span>
                {o.id === me.org.id && <CheckIcon className="size-4" />}
              </DropdownMenuItem>
            ))}
            {me.via === "api_key" && (
              <>
                <DropdownMenuSeparator />
                <p className="px-2 py-1.5 text-xs text-muted-foreground">Signed in with an api key, which is bound to one org.</p>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
