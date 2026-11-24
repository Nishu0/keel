"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { daily } from "@/lib/overview"

const chartConfig = {
  completed: { label: "Completed", color: "var(--st-completed)" },
  failed: { label: "Failed", color: "var(--st-failed)" },
} satisfies ChartConfig

const RANGES = { "90d": "Last 3 months", "30d": "Last 30 days", "7d": "Last 7 days" } as const
type Range = keyof typeof RANGES

export function ChartAreaInteractive() {
  const isMobile = useIsMobile()
  const [picked, setPicked] = React.useState<Range | null>(null)
  // phones default to a week; an explicit choice always wins
  const range: Range = picked ?? (isMobile ? "7d" : "90d")
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90
  const data = daily.slice(-days)
  const total = data.reduce((s, d) => s + d.completed + d.failed, 0)

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Runs per day</CardTitle>
        <CardDescription>
          <span className="tabular-nums">{total.toLocaleString("en-US")}</span> runs, {RANGES[range].toLowerCase()}
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={range}
            onValueChange={(v) => v && setPicked(v as Range)}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex"
          >
            {Object.entries(RANGES).map(([k, label]) => (
              <ToggleGroupItem key={k} value={k}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Select value={range} onValueChange={(v) => setPicked(v as Range)}>
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Time range"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {Object.entries(RANGES).map(([k, label]) => (
                <SelectItem key={k} value={k} className="rounded-lg">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
          <AreaChart data={data} margin={{ left: 0, right: 8 }}>
            <defs>
              <linearGradient id="fillCompleted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-completed)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--color-completed)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="fillFailed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-failed)" stopOpacity={0.5} />
                <stop offset="95%" stopColor="var(--color-failed)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <YAxis tickLine={false} axisLine={false} width={32} tickMargin={4} allowDecimals={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(v) => new Date(v + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--border)" }}
              content={
                <ChartTooltipContent
                  labelFormatter={(v) =>
                    new Date(v + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
                  }
                  indicator="dot"
                />
              }
            />
            <Area dataKey="failed" type="monotone" fill="url(#fillFailed)" stroke="var(--color-failed)" strokeWidth={2} stackId="a" />
            <Area dataKey="completed" type="monotone" fill="url(#fillCompleted)" stroke="var(--color-completed)" strokeWidth={2} stackId="a" />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
