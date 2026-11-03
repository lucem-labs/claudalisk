import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"

import { Pager } from "@/components/ui/pager"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Links } from "@/lib/hypermedia"

type PagedTableProps<T> = {
  columns: ColumnDef<T>[]
  items: T[]
  links: Links | undefined
  onNavigate: (href: string) => void
  getRowId?: (item: T, index: number) => string
  empty?: React.ReactNode
  stacked?: boolean
}

function PagedTable<T>({
  columns,
  items,
  links,
  onNavigate,
  getRowId,
  empty = "No results.",
  stacked = false,
}: PagedTableProps<T>) {
  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  })
  const rows = table.getRowModel().rows

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-md border">
        <Table variant={stacked ? "stacked" : "default"}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} data-label={labelOf(cell.column.columnDef.header)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Pager links={links} onNavigate={onNavigate} />
    </div>
  )
}

function labelOf(header: unknown): string | undefined {
  return typeof header === "string" && header.length > 0 ? header : undefined
}

export { PagedTable }
