import * as React from "react"
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useJob, type UseJobOptions } from "@/shared/api/job"
import type { Link } from "@/shared/lib/hypermedia"
import type { Job } from "@/shared/lib/job"
import { JobPanel } from "@/shared/ui/job-panel"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function job(id: string, overrides: Partial<Job> = {}): Job {
  return {
    id,
    module: "ordering",
    kind: "reindex",
    status: "queued",
    attempts: 0,
    maxAttempts: 5,
    progress: { fraction: null, step: null },
    error: null,
    createdAt: "2026-11-04T00:00:00Z",
    startedAt: null,
    finishedAt: null,
    _links: { self: { href: `/api/jobs/ordering/${id}` } },
    _actions: {},
    ...overrides,
  }
}

const superseded = (id: string) =>
  job(id, {
    status: "canceled",
    error: { type: "/problems/jobs/superseded", title: "A newer job with the same key replaced this one." },
  })

const succeeded = (id: string) =>
  job(id, {
    status: "succeeded",
    progress: { fraction: 1, step: "Reindexed 412 orders" },
    _links: { self: { href: `/api/jobs/ordering/${id}` }, result: { href: "/api/orders" } },
  })

function stubJobs(responses: Record<string, Job[]>) {
  const requests: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      requests.push(`${init?.method ?? "GET"} ${input}`)
      const queue = responses[input]
      if (!queue) return new Response(null, { status: 204 })
      const next = queue.length > 1 ? queue.shift() : queue[0]
      return new Response(JSON.stringify(next), { status: 200, headers: { "Content-Type": "application/json" } })
    })
  )
  return requests
}

function Follow({ link, options }: { link: Link; options?: UseJobOptions }) {
  const query = useJob(link, { interval: 5, ...options })
  return (
    <JobPanel job={query} label="Reindex orders">
      {(done) => <p>Result at {done._links?.result?.href}</p>}
    </JobPanel>
  )
}

function renderJob(ui: React.ReactElement, retry: number | false = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry, retryDelay: 0 } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe("useJob and JobPanel", () => {
  it("polls a job until it succeeds, then shows its summary and invalidates the queries it affects", async () => {
    stubJobs({
      "/api/jobs/ordering/1": [
        job("1", { status: "running", progress: { fraction: 0.5, step: "Reindexing" } }),
        succeeded("1"),
      ],
    })
    const orders = vi.fn(async () => ["order"])
    function Orders() {
      useQuery({ queryKey: ["orders"], queryFn: orders })
      return null
    }
    renderJob(
      <>
        <Orders />
        <Follow link={{ href: "/api/jobs/ordering/1" }} options={{ invalidates: [["orders"]] }} />
      </>
    )

    expect(await screen.findByText("Result at /api/orders")).toBeTruthy()
    expect(screen.getByText("Reindexed 412 orders")).toBeTruthy()
    expect(screen.getByRole("status").textContent).toBe("Done")
    await vi.waitFor(() => expect(orders).toHaveBeenCalledTimes(2))
  })

  it("follows the newest active job when a newer one supersedes it", async () => {
    const requests = stubJobs({
      "/api/jobs/ordering/1": [superseded("1")],
      "/api/jobs/ordering/2": [succeeded("2")],
    })
    const start = vi.fn(async () => ({ href: "/api/jobs/ordering/3" }))
    renderJob(
      <Follow
        link={{ href: "/api/jobs/ordering/1" }}
        options={{ findActive: async () => ({ href: "/api/jobs/ordering/2" }), start }}
      />
    )

    expect(await screen.findByText("Result at /api/orders")).toBeTruthy()
    expect(requests).toContain("GET /api/jobs/ordering/2")
    expect(start).not.toHaveBeenCalled()
  })

  it("starts a new job when a superseded job has no active successor", async () => {
    const requests = stubJobs({
      "/api/jobs/ordering/1": [superseded("1")],
      "/api/jobs/ordering/3": [job("3", { status: "running" }), succeeded("3")],
    })
    const start = vi.fn(async () => ({ href: "/api/jobs/ordering/3" }))
    renderJob(<Follow link={{ href: "/api/jobs/ordering/1" }} options={{ findActive: async () => undefined, start }} />)

    expect(await screen.findByText("Result at /api/orders")).toBeTruthy()
    expect(start).toHaveBeenCalledTimes(1)
    expect(requests.filter((request) => request === "GET /api/jobs/ordering/1")).toHaveLength(1)
  })

  it("shows a superseded job as canceled when no active job is found and none may be started", async () => {
    stubJobs({ "/api/jobs/ordering/1": [superseded("1")] })
    renderJob(<Follow link={{ href: "/api/jobs/ordering/1" }} options={{ findActive: async () => undefined }} />)

    expect(await screen.findByText("A newer job with the same key replaced this one.")).toBeTruthy()
    expect(screen.getByRole("status").textContent).toBe("Canceled")
  })

  it("starts one job for a superseded job even when the query retries", async () => {
    let failures = 1
    const requests: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        requests.push(input)
        if (input === "/api/jobs/ordering/3" && failures-- > 0) return new Response(null, { status: 503 })
        const body = input === "/api/jobs/ordering/1" ? superseded("1") : succeeded("3")
        return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
      })
    )
    const start = vi.fn(async () => ({ href: "/api/jobs/ordering/3" }))
    renderJob(<Follow link={{ href: "/api/jobs/ordering/1" }} options={{ start }} />, 2)

    expect(await screen.findByText("Result at /api/orders")).toBeTruthy()
    expect(start).toHaveBeenCalledTimes(1)
    expect(requests.filter((request) => request === "/api/jobs/ordering/3")).toHaveLength(2)
  })

  it("renders nothing while there is no job to follow", () => {
    function NoJob() {
      const query = useJob(undefined)
      return <JobPanel job={query} label="Reindex orders" />
    }
    const { container } = renderJob(<NoJob />)

    expect(container.textContent).toBe("")
  })

  it("shows a superseded job as canceled when the page gives no way to follow it", async () => {
    stubJobs({ "/api/jobs/ordering/1": [superseded("1")] })
    renderJob(<Follow link={{ href: "/api/jobs/ordering/1" }} />)

    expect(await screen.findByText("A newer job with the same key replaced this one.")).toBeTruthy()
    expect(screen.getByRole("status").textContent).toBe("Canceled")
  })

  it("shows a failed job's error and no result", async () => {
    stubJobs({
      "/api/jobs/ordering/1": [
        job("1", {
          status: "failed",
          error: { type: "/problems/ordering/already-shipped", title: "Already shipped", detail: "Order 42 has shipped." },
        }),
      ],
    })
    renderJob(<Follow link={{ href: "/api/jobs/ordering/1" }} />)

    expect(await screen.findByText("Order 42 has shipped.")).toBeTruthy()
    expect(screen.queryByText(/Result at/)).toBeNull()
  })

  it("sends the cancel action while the job offers it", async () => {
    const requests = stubJobs({
      "/api/jobs/ordering/1": [
        job("1", {
          status: "running",
          _actions: { cancel: { href: "/api/jobs/ordering/1/cancel", method: "POST" } },
        }),
      ],
    })
    renderJob(<Follow link={{ href: "/api/jobs/ordering/1" }} />)

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }))

    await vi.waitFor(() => expect(requests).toContain("POST /api/jobs/ordering/1/cancel"))
    expect(screen.getByRole("progressbar", { name: "Reindex orders progress" })).toBeTruthy()
  })
})
