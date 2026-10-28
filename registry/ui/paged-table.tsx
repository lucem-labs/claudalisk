import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
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
}

function PagedTable<T>({
  columns,
  items,
  links,
  onNavigate,
  getRowId,
  empty = "No results.",
}: PagedTableProps<T>) {
  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  })
  const prev = links?.prev
  const next = links?.next
  const rows = table.getRowModel().rows

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-md border">
        <Table>
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
                    <TableCell key={cell.id}>
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
      {prev || next ? (
        <nav aria-label="Pages" className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!prev}
            onClick={() => prev && onNavigate(prev.href)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!next}
            onClick={() => next && onNavigate(next.href)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  )
}

export { PagedTable }
