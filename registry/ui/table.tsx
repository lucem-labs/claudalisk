import * as React from "react"
import { cn } from "cn"

type TableVariant = "default" | "stacked"

const STACKED_CLASSES = [
  "@max-md:block",
  "@max-md:[&_tbody]:flex @max-md:[&_tbody]:flex-col @max-md:[&_tbody]:gap-3",
  "@max-md:[&_thead]:sr-only",
  "@max-md:[&_tbody_tr]:flex @max-md:[&_tbody_tr]:flex-col @max-md:[&_tbody_tr]:rounded-md @max-md:[&_tbody_tr]:border @max-md:[&_tbody_tr]:p-2",
  "@max-md:[&_tbody_td]:grid @max-md:[&_tbody_td]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @max-md:[&_tbody_td]:gap-2 @max-md:[&_tbody_td]:whitespace-normal",
  "@max-md:[&_tbody_td[data-label]]:before:content-[attr(data-label)] @max-md:[&_tbody_td]:before:font-medium @max-md:[&_tbody_td]:before:text-muted-foreground",
  "@max-md:[&_tbody_td:not([data-label])]:block",
].join(" ")

const TableVariantContext = React.createContext<TableVariant>("default")

function useStackedRole(role: string) {
  return React.useContext(TableVariantContext) === "stacked" ? role : undefined
}

function Table({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"table"> & { variant?: TableVariant }) {
  return (
    <TableVariantContext.Provider value={variant}>
      <div
        data-slot="table-container"
        className={cn("relative w-full overflow-x-auto", variant === "stacked" && "@container")}
      >
        <table
          data-slot="table"
          data-variant={variant}
          role={variant === "stacked" ? "table" : undefined}
          className={cn("w-full caption-bottom text-sm", variant === "stacked" && STACKED_CLASSES, className)}
          {...props}
        />
      </div>
    </TableVariantContext.Provider>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" role={useStackedRole("rowgroup")} className={cn("[&_tr]:border-b", className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" role={useStackedRole("rowgroup")} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      role={useStackedRole("rowgroup")}
      className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      role={useStackedRole("row")}
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      role={useStackedRole("columnheader")}
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      role={useStackedRole("cell")}
      className={cn("p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption data-slot="table-caption" className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  )
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
export type { TableVariant }
