"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

const TITLES: [RegExp, string][] = [
  [/^\/app\/?$/, "Overview"],
  [/^\/app\/runs\/compare/, "Compare runs"],
  [/^\/app\/runs\/[^/]+/, "Run"],
  [/^\/app\/runs/, "Runs"],
  [/^\/app\/agents\/[^/]+/, "Agent"],
  [/^\/app\/agents/, "Agents"],
  [/^\/app\/tools/, "Tools"],
  [/^\/app\/usage/, "Usage"],
  [/^\/app\/settings\/members/, "Members"],
  [/^\/app\/settings\/keys/, "API keys"],
  [/^\/app\/settings\/secrets/, "Secrets"],
  [/^\/app\/settings\/billing/, "Billing"],
]

export function SiteHeader() {
  const path = usePathname()
  const title = TITLES.find(([re]) => re.test(path))?.[1] ?? "keel"
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <h1 className="text-base font-medium">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" asChild size="sm" className="hidden sm:flex">
            <a href="https://github.com/Nishu0/keel" rel="noopener noreferrer" target="_blank" className="text-muted-foreground">
              GitHub
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/">Home</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
