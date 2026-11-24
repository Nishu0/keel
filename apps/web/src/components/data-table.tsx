"use client"

import * as React from "react"
import Link from "next/link"
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import {
  ArrowUpDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  Columns3Icon,
  ChevronDownIcon,
  CornerDownRightIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StatusBadge } from "@/components/kit"
import { ago, isLive, ms, tokens, usd } from "@/lib/format"
import { useNow } from "@/lib/live"
import type { Run } from "@/lib/types"

export type RunRow = Run & { agent_name: string }

const TABS = [
  { id: "all", label: "All", match: () => true },
  { id: "live", label: "Live", match: (r: Run) => isLive(r.status) || r.status === "queued" },
  { id: "attention", label: "Needs a decision", match: (r: Run) => r.status === "needs_review" || r.status === "waiting_for_approval" },
  { id: "done", label: "Finished", match: (r: Run) => ["completed", "failed", "cancelled"].includes(r.status) },
] as const

function SortHeader({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="-ml-2 h-7 px-2 font-normal text-muted-foreground" onClick={onClick}>
      {label}
      <ArrowUpDownIcon className="size-3.5" />
    </Button>
  )
}

const columns: ColumnDef<RunRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} aria-label="Select run" />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "input",
    header: "Task",
    enableHiding: false,
    cell: ({ row }) => {
      const r = row.original
      return (
        <div className="flex max-w-[460px] gap-2">
          {r.parent_run_id && <CornerDownRightIcon className="mt-0.5 size-3.5 shrink-0 text-faint" />}
          <div className="min-w-0">
            <Link href={`/app/runs/${r.id}`} className="block truncate text-foreground hover:underline">
              {r.input.task}
            </Link>
            <span className="font-mono text-[11.5px] text-muted-foreground">{r.id}</span>
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: "agent_name",
    header: "Agent",
    cell: ({ row }) => (
      <Badge variant="outline" className="px-1.5 font-mono font-normal text-ink-2">
        {row.original.agent_name}
        <span className="text-faint">v{row.original.agent_version}</span>
      </Badge>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "steps",
    header: ({ column }) => <SortHeader label="Steps" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
    cell: ({ row }) => <span className="tabular-nums text-ink-2">{row.original.steps}</span>,
  },
  {
    id: "tokens",
    accessorFn: (r) => r.usage.input_tokens + r.usage.output_tokens,
    header: ({ column }) => <SortHeader label="Tokens" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
    cell: ({ getValue }) => <span className="tabular-nums text-ink-2">{tokens(getValue<number>())}</span>,
  },
  {
    id: "cost",
    accessorFn: (r) => r.usage.cost_usd,
    header: ({ column }) => <SortHeader label="Cost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
    cell: ({ getValue }) => <span className="tabular-nums text-ink-2">{usd(getValue<number>())}</span>,
  },
  {
    id: "duration",
    accessorFn: (r) => r.duration_ms ?? -1,
    header: "Duration",
    cell: ({ row }) =>
      row.original.duration_ms ? (
        <span className="tabular-nums text-ink-2">{ms(row.original.duration_ms)}</span>
      ) : isLive(row.original.status) ? (
        <span className="text-st-running">live</span>
      ) : (
        <span className="text-faint">–</span>
      ),
  },
  {
    id: "created",
    accessorFn: (r) => Date.parse(r.created_at),
    header: ({ column }) => <SortHeader label="Started" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
    cell: ({ row }) => <Ago iso={row.original.created_at} />,
  },
]

function Ago({ iso }: { iso: string }) {
  const now = useNow()
  return <span className="tabular-nums text-muted-foreground">{ago(iso, now)}</span>
}

export function DataTable({ data }: { data: RunRow[] }) {
  const [tab, setTab] = React.useState<(typeof TABS)[number]["id"]>("all")
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "created", desc: true }])
  const [visibility, setVisibility] = React.useState<VisibilityState>({ duration: false })
  const [selection, setSelection] = React.useState({})
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 })

  const match = TABS.find((t) => t.id === tab)!.match
  const rows = React.useMemo(() => data.filter(match), [data, match])

  // eslint-disable-next-line react-hooks/incompatible-library -- tanstack table is the block's table engine
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnVisibility: visibility, rowSelection: selection, pagination },
    getRowId: (r) => r.id,
    enableRowSelection: true,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    onRowSelectionChange: setSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full flex-col justify-start gap-6">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <TabsList className="**:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:bg-muted-foreground/30 **:data-[slot=badge]:px-1">
          {TABS.map((t) => {
            const n = data.filter(t.match).length
            return (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
                {t.id !== "all" && n > 0 && <Badge variant="secondary">{n}</Badge>}
              </TabsTrigger>
            )
          })}
        </TabsList>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3Icon />
              <span className="hidden lg:inline">Columns</span>
              <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {table
              .getAllColumns()
              .filter((c) => c.getCanHide())
              .map((c) => (
                <DropdownMenuCheckboxItem key={c.id} className="capitalize" checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)}>
                  {c.id === "agent_name" ? "agent" : c.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead key={h.id} className="text-muted-foreground">
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-2.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                    No runs here.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between px-1">
          <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
            {table.getFilteredSelectedRowModel().rows.length} of {table.getFilteredRowModel().rows.length} selected
          </div>
          <div className="flex w-full items-center gap-6 lg:w-fit">
            <div className="flex w-fit items-center justify-center text-sm font-medium">
              Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button variant="outline" className="hidden h-8 w-8 p-0 lg:flex" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
                <span className="sr-only">First page</span>
                <ChevronsLeftIcon />
              </Button>
              <Button variant="outline" className="size-8" size="icon" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                <span className="sr-only">Previous page</span>
                <ChevronLeftIcon />
              </Button>
              <Button variant="outline" className="size-8" size="icon" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                <span className="sr-only">Next page</span>
                <ChevronRightIcon />
              </Button>
              <Button variant="outline" className="hidden size-8 lg:flex" size="icon" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
                <span className="sr-only">Last page</span>
                <ChevronsRightIcon />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Tabs>
  )
}
