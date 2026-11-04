import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { ListOrdered } from "lucide-react"

import { followLink } from "@/shared/api/hypermedia"
import { type Representation } from "@/shared/lib/hypermedia"
import { ActionButton } from "@/shared/ui/action-button"
import { AppShell } from "@/shared/ui/app-shell"
import { Input } from "@/shared/ui/input"
import { PagedTable } from "@/shared/ui/paged-table"
import { ProblemAlert } from "@/shared/ui/problem-alert"
import { ProblemField } from "@/shared/ui/problem-field"
import { QueryState } from "@/shared/ui/query-state"

type Order = Representation & {
  id: string
  status: string
}

type OrderPage = Representation & {
  items: Order[]
}

const columns: ColumnDef<Order>[] = [
  { accessorKey: "id", header: "Order" },
  { accessorKey: "status", header: "Status" },
  {
    id: "actions",
    cell: ({ row }) => (
      <ActionButton representation={row.original} action="cancel" variant="outline" size="sm">
        Cancel
      </ActionButton>
    ),
  },
]

export function App() {
  const [href, setHref] = React.useState("/api/orders")
  const [error, setError] = React.useState<unknown>()
  const queryClient = useQueryClient()
  const orders = useQuery({
    queryKey: ["orders", href],
    queryFn: ({ signal }) => followLink<OrderPage>({ href }, { signal }),
  })

  return (
    <AppShell title="Fixture" navigation={[{ to: "/", label: "Orders", icon: ListOrdered, end: true }]}>
      <QueryState query={orders} isEmpty={(page) => page.items.length === 0} emptyTitle="No orders yet">
        {(page) => (
          <PagedTable
            columns={columns}
            items={page.items}
            links={page._links}
            onNavigate={setHref}
            getRowId={(order) => order.id}
          />
        )}
      </QueryState>
      <form className="flex max-w-sm flex-col gap-4">
        <ProblemField name="note" label="Note" error={error}>
          <Input />
        </ProblemField>
        <ProblemAlert error={error} fields={["note"]} />
        <ActionButton
          representation={orders.data}
          action="create"
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["orders"] })}
          onError={setError}
        >
          Create
        </ActionButton>
      </form>
    </AppShell>
  )
}
