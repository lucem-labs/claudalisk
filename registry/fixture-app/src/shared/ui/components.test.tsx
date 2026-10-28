import * as React from "react"
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ProblemError } from "@/shared/lib/problem-details"
import { ActionButton } from "@/shared/ui/action-button"
import { Input } from "@/shared/ui/input"
import { PagedTable } from "@/shared/ui/paged-table"
import { ProblemField } from "@/shared/ui/problem-field"
import { QueryState } from "@/shared/ui/query-state"

function renderWithQueries(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("ActionButton", () => {
  it("renders nothing when the action is not in _actions", () => {
    renderWithQueries(
      <ActionButton representation={{ _actions: {} }} action="cancel">
        Cancel
      </ActionButton>
    )

    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull()
  })

  it("sends the action when it is in _actions", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    const onSuccess = vi.fn()
    renderWithQueries(
      <ActionButton
        representation={{ _actions: { cancel: { href: "/api/orders/1/cancel", method: "POST" } } }}
        action="cancel"
        onSuccess={onSuccess}
      >
        Cancel
      </ActionButton>
    )

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith("/api/orders/1/cancel", expect.objectContaining({ method: "POST" }))
  })
})

describe("PagedTable", () => {
  const columns = [{ accessorKey: "name", header: "Name" }]

  it("follows the next link and disables a missing prev link", () => {
    const onNavigate = vi.fn()
    render(
      <PagedTable
        columns={columns}
        items={[{ name: "First" }]}
        links={{ self: { href: "/api/things" }, next: { href: "/api/things?after=1" } }}
        onNavigate={onNavigate}
      />
    )

    expect(screen.getByRole("button", { name: "Previous" })).toHaveProperty("disabled", true)
    fireEvent.click(screen.getByRole("button", { name: "Next" }))

    expect(onNavigate).toHaveBeenCalledWith("/api/things?after=1")
  })

  it("shows no paging when the page has neither link", () => {
    render(<PagedTable columns={columns} items={[]} links={{ self: { href: "/api/things" } }} onNavigate={vi.fn()} />)

    expect(screen.getByText("No results.")).toBeTruthy()
    expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull()
  })
})

describe("ProblemField", () => {
  it("marks the control invalid and shows its validation errors", () => {
    const error = new ProblemError({ title: "Invalid", status: 400, errors: { Note: ["Note is too long."] } })
    render(
      <ProblemField name="note" label="Note" error={error}>
        <Input />
      </ProblemField>
    )

    expect(screen.getByLabelText("Note").getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByText("Note is too long.")).toBeTruthy()
  })
})

function Loaded({ result }: { result: () => Promise<string[]> }) {
  const query = useQuery({ queryKey: ["things"], queryFn: result })
  return (
    <QueryState query={query} isEmpty={(data) => data.length === 0} emptyTitle="No things">
      {(data) => <p>{data.join(", ")}</p>}
    </QueryState>
  )
}

describe("QueryState", () => {
  it("shows the loading state, then the data", async () => {
    renderWithQueries(<Loaded result={async () => ["a", "b"]} />)

    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy()
    expect(await screen.findByText("a, b")).toBeTruthy()
  })

  it("shows the empty state", async () => {
    renderWithQueries(<Loaded result={async () => []} />)

    expect(await screen.findByText("No things")).toBeTruthy()
  })

  it("shows the problem's title and detail on an error", async () => {
    renderWithQueries(
      <Loaded
        result={async () => {
          throw new ProblemError({ title: "Not found", detail: "The list does not exist.", status: 404 })
        }}
      />
    )

    expect(await screen.findByText("Not found")).toBeTruthy()
    expect(screen.getByText("The list does not exist.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
  })
})
