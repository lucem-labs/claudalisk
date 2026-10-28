import * as React from "react"
import type { UseQueryResult } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { ProblemAlert } from "@/components/ui/problem-alert"
import { Skeleton } from "@/components/ui/skeleton"

type QueryStateProps<T> = {
  query: UseQueryResult<T>
  isEmpty?: (data: T) => boolean
  emptyTitle?: React.ReactNode
  emptyDescription?: React.ReactNode
  loading?: React.ReactNode
  children: (data: T) => React.ReactNode
}

function QueryState<T>({
  query,
  isEmpty,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  loading,
  children,
}: QueryStateProps<T>) {
  if (query.isPending) {
    return loading ?? <QueryLoading />
  }

  if (query.isError) {
    return (
      <ProblemAlert
        error={query.error}
        action={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Try again
          </Button>
        }
      />
    )
  }

  if (isEmpty?.(query.data)) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          {emptyDescription ? <EmptyDescription>{emptyDescription}</EmptyDescription> : null}
        </EmptyHeader>
      </Empty>
    )
  }

  return <>{children(query.data)}</>
}

function QueryLoading() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-2">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  )
}

export { QueryState, QueryLoading }
