import * as React from "react"
import { QueryClient, QueryClientProvider, type UseQueryResult } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import axe from "axe-core"
import { MemoryRouter } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { applyColorScheme, COLOR_SCHEME_STORAGE_KEY } from "@/shared/lib/color-scheme"
import type { Job } from "@/shared/lib/job"
import { ProblemError } from "@/shared/lib/problem-details"
import { ActionButton } from "@/shared/ui/action-button"
import { AppShell } from "@/shared/ui/app-shell"
import { Badge } from "@/shared/ui/badge"
import { ColorSchemeToggle } from "@/shared/ui/color-scheme-toggle"
import { Disclosure } from "@/shared/ui/disclosure"
import { Heading, PageHeader } from "@/shared/ui/heading"
import { Input } from "@/shared/ui/input"
import { JobPanel } from "@/shared/ui/job-panel"
import { PagedTable } from "@/shared/ui/paged-table"
import { Pager } from "@/shared/ui/pager"
import { ProblemAlert } from "@/shared/ui/problem-alert"
import { ProblemField } from "@/shared/ui/problem-field"
import { QueryState } from "@/shared/ui/query-state"
import { SectionCard } from "@/shared/ui/section-card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table"

async function expectAccessible(container: Element, { region = false } = {}) {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: region } },
  })
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([])
}

function withQueries(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>
}

function stubMatchMedia(dark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: dark && query === "(prefers-color-scheme: dark)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function settledQuery<T>(data: T) {
  return { isPending: false, isError: false, data, error: null, fetchStatus: "idle", refetch: vi.fn() } as unknown as UseQueryResult<T>
}

function failedQuery<T>(error: unknown) {
  return { isPending: false, isError: true, data: undefined, error, fetchStatus: "idle", refetch: vi.fn() } as unknown as UseQueryResult<T>
}

function pendingQuery<T>() {
  return { isPending: true, isError: false, data: undefined, error: null, fetchStatus: "fetching", refetch: vi.fn() } as unknown as UseQueryResult<T>
}

beforeEach(() => {
  stubMatchMedia(false)
  window.localStorage.clear()
  document.documentElement.classList.remove("dark")
  document.documentElement.style.colorScheme = ""
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("action-button", () => {
  it("is one named button with no violations", async () => {
    const { container } = render(
      withQueries(
        <ActionButton representation={{ _actions: { cancel: { href: "/api/orders/1/cancel", method: "POST" } } }} action="cancel">
          Cancel
        </ActionButton>
      )
    )

    expect(screen.getAllByRole("button")).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy()
    await expectAccessible(container)
  })
})

describe("app-shell", () => {
  it("has one main, one named navigation and the color scheme toggle, with no violations", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell title="Shop" navigation={[{ to: "/", label: "Home" }, { to: "/orders", label: "Orders" }]}>
          <h1>Home</h1>
        </AppShell>
      </MemoryRouter>
    )

    expect(screen.getAllByRole("main")).toHaveLength(1)
    expect(screen.getAllByRole("navigation")).toHaveLength(1)
    expect(within(screen.getByRole("navigation", { name: "Main" })).getAllByRole("link")).toHaveLength(2)
    expect(screen.getByRole("button", { name: "Dark mode" }).getAttribute("aria-pressed")).toBe("false")
    await expectAccessible(container, { region: true })
  })
})

describe("color-scheme", () => {
  it("applies the stored choice before the system preference and sets color-scheme with it", () => {
    stubMatchMedia(true)
    expect(applyColorScheme()).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe("dark")

    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, "light")
    expect(applyColorScheme()).toBe("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe("light")
  })

  it("is a toggle button that stores the choice, with no violations", async () => {
    applyColorScheme()
    const { container } = render(<ColorSchemeToggle />)

    const toggle = screen.getByRole("button", { name: "Dark mode" })
    expect(toggle.getAttribute("aria-pressed")).toBe("false")
    await expectAccessible(container)

    fireEvent.click(toggle)

    expect(toggle.getAttribute("aria-pressed")).toBe("true")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe("dark")
    expect(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe("dark")
    await expectAccessible(container)
  })
})

describe("badge", () => {
  it("is plain text with no role, with no violations", async () => {
    const { container } = render(<Badge variant="success">Paid</Badge>)

    expect(screen.getByText("Paid").getAttribute("role")).toBeNull()
    expect(screen.queryByRole("status")).toBeNull()
    await expectAccessible(container)
  })
})

describe("disclosure", () => {
  it("is a button that controls its content, with no violations open or closed", async () => {
    const { container } = render(<Disclosure trigger="Details">The order shipped on Monday.</Disclosure>)

    const button = screen.getByRole("button", { name: "Details" })
    expect(button.getAttribute("aria-expanded")).toBe("false")
    await expectAccessible(container)

    fireEvent.click(button)

    expect(button.getAttribute("aria-expanded")).toBe("true")
    expect(document.getElementById(button.getAttribute("aria-controls") ?? "")?.textContent).toBe("The order shipped on Monday.")
    await expectAccessible(container)
  })
})

describe("heading", () => {
  it("renders real headings with the page's h1 in its header, with no violations", async () => {
    const { container } = render(
      <main>
        <PageHeader title="Orders" description="Every order" actions={<button type="button">New order</button>} />
        <Heading level={2}>Open orders</Heading>
      </main>
    )

    expect(screen.getByRole("heading", { level: 1, name: "Orders" }).closest("header")).toBeTruthy()
    expect(screen.getByRole("heading", { level: 2, name: "Open orders" }).closest("header")).toBeNull()
    expect(screen.getAllByRole("main")).toHaveLength(1)
    await expectAccessible(container)
  })
})

describe("job", () => {
  const job: Job = {
    id: "1",
    module: "orders",
    kind: "export",
    status: "running",
    attempts: 1,
    maxAttempts: 3,
    progress: { fraction: 0.5, step: "Writing rows" },
    error: null,
    createdAt: "2026-11-04T00:00:00Z",
    startedAt: "2026-11-04T00:00:01Z",
    finishedAt: null,
    _links: { self: { href: "/api/jobs/1" } },
    _actions: { cancel: { href: "/api/jobs/1/cancel", method: "POST" } },
  }

  it("is a region named by its label with a status, a named progress bar and a cancel button, with no violations", async () => {
    const { container } = render(withQueries(<JobPanel job={settledQuery(job)} label="Export" />))

    const region = screen.getByRole("region", { name: "Export" })
    expect(within(region).getByRole("status").textContent).toBe("Running")
    expect(within(region).getByRole("progressbar", { name: "Export progress" })).toBeTruthy()
    expect(within(region).getByRole("button", { name: "Cancel" })).toBeTruthy()
    await expectAccessible(container)
  })
})

describe("paged-table", () => {
  it("is a table with column headers and a named pages navigation, with no violations", async () => {
    const { container } = render(
      <PagedTable
        columns={[{ accessorKey: "name", header: "Name" }]}
        items={[{ name: "First" }]}
        links={{ self: { href: "/api/things" }, next: { href: "/api/things?after=1" } }}
        onNavigate={vi.fn()}
      />
    )

    const table = screen.getByRole("table")
    expect(within(table).getByRole("columnheader", { name: "Name" })).toBeTruthy()
    expect(within(table).getByRole("cell", { name: "First" })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeTruthy()
    await expectAccessible(container)
  })

  it("keeps its table roles when stacked, with no violations", async () => {
    const { container } = render(
      <PagedTable columns={[{ accessorKey: "name", header: "Name" }]} items={[{ name: "First" }]} links={undefined} onNavigate={vi.fn()} stacked />
    )

    expect(within(screen.getByRole("table")).getByRole("columnheader", { name: "Name" })).toBeTruthy()
    await expectAccessible(container)
  })
})

describe("pager", () => {
  it("is a named navigation with two buttons, with no violations", async () => {
    const { container } = render(
      <Pager links={{ prev: { href: "/api/things?before=5" }, next: { href: "/api/things?after=9" } }} onNavigate={vi.fn()} page={2} pageCount={5} />
    )

    const navigation = screen.getByRole("navigation", { name: "Pages" })
    expect(within(navigation).getAllByRole("button").map((button) => button.textContent)).toEqual(["Previous", "Next"])
    await expectAccessible(container)
  })
})

describe("problem-alert", () => {
  it("is an alert with the problem's title and detail, with no violations", async () => {
    const { container } = render(
      <ProblemAlert error={new ProblemError({ title: "Not found", detail: "The order does not exist.", status: 404 })} />
    )

    const alert = screen.getByRole("alert")
    expect(alert.textContent).toContain("Not found")
    expect(alert.textContent).toContain("The order does not exist.")
    await expectAccessible(container)
  })
})

describe("problem-field", () => {
  it("is a labelled textbox marked invalid with its error, with no violations", async () => {
    const error = new ProblemError({ title: "Invalid", status: 400, errors: { Note: ["Note is too long."] } })
    const { container } = render(
      <ProblemField name="note" label="Note" error={error}>
        <Input />
      </ProblemField>
    )

    expect(screen.getByRole("textbox", { name: "Note" }).getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByRole("alert").textContent).toContain("Note is too long.")
    await expectAccessible(container)
  })
})

describe("query-state", () => {
  it("is a status named Loading while pending, with no violations", async () => {
    const { container } = render(<QueryState query={pendingQuery<string[]>()}>{(data) => <p>{data.join(", ")}</p>}</QueryState>)

    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy()
    await expectAccessible(container)
  })

  it("is an alert with a retry button on an error, with no violations", async () => {
    const { container } = render(
      <QueryState query={failedQuery<string[]>(new ProblemError({ title: "Not found", status: 404 }))}>
        {(data) => <p>{data.join(", ")}</p>}
      </QueryState>
    )

    expect(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" })).toBeTruthy()
    await expectAccessible(container)
  })

  it("has no violations when empty", async () => {
    const { container } = render(
      <QueryState query={settledQuery<string[]>([])} isEmpty={(data) => data.length === 0} emptyTitle="No things">
        {(data) => <p>{data.join(", ")}</p>}
      </QueryState>
    )

    expect(screen.getByText("No things")).toBeTruthy()
    await expectAccessible(container)
  })
})

describe("section-card", () => {
  it("is a region named by its heading when asked, with no violations", async () => {
    const { container } = render(
      <SectionCard title="Totals" region>
        <p>42</p>
      </SectionCard>
    )

    const region = screen.getByRole("region", { name: "Totals" })
    expect(within(region).getByRole("heading", { level: 2, name: "Totals" })).toBeTruthy()
    await expectAccessible(container)
  })
})

describe("table", () => {
  for (const variant of ["default", "stacked"] as const) {
    it(`keeps table, row, column header and cell roles when ${variant}, with no violations`, async () => {
      const { container } = render(
        <Table variant={variant}>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell data-label="Status">Shipped</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )

      const table = screen.getByRole("table")
      expect(within(table).getAllByRole("row")).toHaveLength(2)
      expect(within(table).getByRole("columnheader", { name: "Status" })).toBeTruthy()
      expect(within(table).getByRole("cell", { name: "Shipped" })).toBeTruthy()
      await expectAccessible(container)
    })
  }
})
