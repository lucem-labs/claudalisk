import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ProblemError } from "@/shared/lib/problem-details"
import { Badge } from "@/shared/ui/badge"
import { Disclosure } from "@/shared/ui/disclosure"
import { Heading, PageHeader } from "@/shared/ui/heading"
import { PagedTable } from "@/shared/ui/paged-table"
import { Pager } from "@/shared/ui/pager"
import { ProblemAlert } from "@/shared/ui/problem-alert"
import { SectionCard } from "@/shared/ui/section-card"
import { Table, TableBody, TableCell, TableRow } from "@/shared/ui/table"

afterEach(cleanup)

describe("Heading", () => {
  it("renders a heading of its level", () => {
    render(<Heading level={3}>Lines</Heading>)

    expect(screen.getByRole("heading", { level: 3, name: "Lines" })).toBeTruthy()
  })

  it("gives a page header an h1, its description and its actions", () => {
    render(<PageHeader title="Orders" description="Every order" actions={<button>New order</button>} />)

    expect(screen.getByRole("heading", { level: 1, name: "Orders" })).toBeTruthy()
    expect(screen.getByText("Every order")).toBeTruthy()
    expect(screen.getByRole("button", { name: "New order" })).toBeTruthy()
  })
})

describe("SectionCard", () => {
  it("is a region named by its heading when asked", () => {
    render(
      <SectionCard title="Totals" region>
        <p>42</p>
      </SectionCard>
    )

    const region = screen.getByRole("region", { name: "Totals" })
    expect(region.querySelector("h2")?.textContent).toBe("Totals")
  })

  it("is no region unless asked", () => {
    render(<SectionCard title="Totals">42</SectionCard>)

    expect(screen.queryByRole("region")).toBeNull()
    expect(screen.getByRole("heading", { level: 2, name: "Totals" })).toBeTruthy()
  })
})

describe("Disclosure", () => {
  it("shows its content once its button is pressed", () => {
    render(<Disclosure trigger="Details">The order shipped on Monday.</Disclosure>)

    const button = screen.getByRole("button", { name: "Details" })
    expect(button.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByText("The order shipped on Monday.")).toBeNull()

    fireEvent.click(button)

    expect(button.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("The order shipped on Monday.")).toBeTruthy()
  })
})

describe("Pager", () => {
  it("shows the page count and follows the prev link", () => {
    const onNavigate = vi.fn()
    render(
      <Pager
        links={{ prev: { href: "/api/things?before=5" }, next: { href: "/api/things?after=9" } }}
        onNavigate={onNavigate}
        page={2}
        pageCount={5}
      />
    )

    expect(screen.getByRole("navigation", { name: "Pages" }).textContent).toContain("Page 2 of 5")
    fireEvent.click(screen.getByRole("button", { name: "Previous" }))

    expect(onNavigate).toHaveBeenCalledWith("/api/things?before=5")
    expect(screen.getByRole("button", { name: "Next" }).getAttribute("type")).toBe("button")
  })

  it("renders nothing without prev or next", () => {
    render(<Pager links={{ self: { href: "/api/things" } }} onNavigate={vi.fn()} />)

    expect(screen.queryByRole("navigation")).toBeNull()
  })
})

describe("Table", () => {
  it("marks a stacked table and keeps each cell's label", () => {
    render(
      <Table variant="stacked">
        <TableBody>
          <TableRow>
            <TableCell data-label="Status">Shipped</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )

    expect(screen.getByRole("table").getAttribute("data-variant")).toBe("stacked")
    expect(screen.getByRole("cell", { name: "Shipped" }).getAttribute("data-label")).toBe("Status")
    expect(screen.getByRole("row").getAttribute("role")).toBe("row")
    expect(screen.getByRole("cell", { name: "Shipped" }).getAttribute("role")).toBe("cell")
  })

  it("adds no explicit roles to a default table", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Shipped</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )

    expect(screen.getByRole("cell", { name: "Shipped" }).getAttribute("role")).toBeNull()
  })

  it("labels a stacked paged table's cells with their column headers", () => {
    render(
      <PagedTable
        columns={[{ accessorKey: "name", header: "Name" }]}
        items={[{ name: "First" }]}
        links={undefined}
        onNavigate={vi.fn()}
        stacked
      />
    )

    expect(screen.getByRole("table").getAttribute("data-variant")).toBe("stacked")
    expect(screen.getByRole("cell", { name: "First" }).getAttribute("data-label")).toBe("Name")
  })

  it("labels a cell from the column's meta label when its header is not text", () => {
    render(
      <PagedTable
        columns={[{ accessorKey: "name", header: () => <span>Name</span>, meta: { label: "Name" } }]}
        items={[{ name: "First" }]}
        links={undefined}
        onNavigate={vi.fn()}
        stacked
      />
    )

    expect(screen.getByRole("cell", { name: "First" }).getAttribute("data-label")).toBe("Name")
  })
})

describe("Badge", () => {
  it("has success and warning variants", () => {
    render(
      <>
        <Badge variant="success">Paid</Badge>
        <Badge variant="warning">Late</Badge>
      </>
    )

    expect(screen.getByText("Paid").getAttribute("data-variant")).toBe("success")
    expect(screen.getByText("Late").getAttribute("data-variant")).toBe("warning")
  })
})

describe("ProblemAlert", () => {
  it("shows the field errors of a validation problem that has no detail", () => {
    const error = new ProblemError({
      title: "One or more validation errors occurred.",
      status: 400,
      errors: { Name: ["Name is required."] },
    })
    render(<ProblemAlert error={error} />)

    expect(screen.getByText("Name is required.")).toBeTruthy()
  })

  it("leaves out the field errors a form shows by its fields", () => {
    const error = new ProblemError({
      title: "One or more validation errors occurred.",
      status: 400,
      errors: { Name: ["Name is required."], Lines: ["Add a line."] },
    })
    render(<ProblemAlert error={error} fields={["name"]} />)

    expect(screen.queryByText("Name is required.")).toBeNull()
    expect(screen.getByText("Add a line.")).toBeTruthy()
  })
})
