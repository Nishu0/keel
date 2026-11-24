"use client"

import Link from "next/link"
import { CircleAlertIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { stats } from "@/lib/overview"

const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`

function Trend({ v, goodWhenUp = true }: { v: number; goodWhenUp?: boolean }) {
  const up = v >= 0
  const Icon = up ? TrendingUpIcon : TrendingDownIcon
  const good = up === goodWhenUp
  return (
    <Badge variant="outline" className={good ? "text-ink-2" : "text-st-review"}>
      <Icon />
      {pct(v)}
    </Badge>
  )
}

export function SectionCards() {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Runs this week</CardDescription>
          <CardTitle className="stat-num text-4xl @[250px]/card:text-[42px]">
            {stats.runsWeek.toLocaleString("en-US")}
          </CardTitle>
          <CardAction>
            <Trend v={stats.runsDelta} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="text-ink-2">{stats.live} running right now</div>
          <div className="text-muted-foreground">Compared with the week before</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Spend this week</CardDescription>
          <CardTitle className="stat-num text-4xl @[250px]/card:text-[42px]">
            ${stats.spendWeek.toFixed(2)}
          </CardTitle>
          <CardAction>
            <Trend v={stats.spendDelta} goodWhenUp={false} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="text-ink-2">Model tokens and sandbox time</div>
          <div className="text-muted-foreground">Billed on the 1st</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Finished cleanly</CardDescription>
          <CardTitle className="stat-num text-4xl @[250px]/card:text-[42px]">
            {(stats.successWeek * 100).toFixed(1)}%
          </CardTitle>
          <CardAction>
            <Trend v={stats.successWeek - stats.successPrev} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="text-ink-2">Zero duplicate external calls</div>
          <div className="text-muted-foreground">Failed runs include limit hits</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Needs a decision</CardDescription>
          <CardTitle className="stat-num text-4xl @[250px]/card:text-[42px]">
            {stats.attention}
          </CardTitle>
          <CardAction>
            {stats.attention > 0 && (
              <Badge variant="outline" className="text-st-review">
                <CircleAlertIcon />
                Waiting
              </Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <Link href="/app/runs?status=attention" className="text-ink-2 underline decoration-border underline-offset-4 hover:decoration-foreground">
            Approvals and in doubt calls
          </Link>
          <div className="text-muted-foreground">Paused runs hold no worker</div>
        </CardFooter>
      </Card>
    </div>
  )
}
