import { afterEach, describe, expect, it, vi } from "vitest"

import { followLink, sendAction } from "@/shared/api/hypermedia"
import { ProblemError } from "@/shared/lib/problem-details"

function respond(status: number, body?: unknown, headers: Record<string, string> = {}) {
  const fetchMock = vi.fn(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
      })
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("hypermedia client", () => {
  it("sends an action with its method, body and If-Match", async () => {
    const fetchMock = respond(200, { id: "1" }, { ETag: '"4"' })

    const response = await sendAction(
      { href: "/api/orders/1/cancel", method: "POST" },
      { body: { reason: "late" }, ifMatch: '"3"' }
    )

    expect(fetchMock).toHaveBeenCalledWith("/api/orders/1/cancel", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "If-Match": '"3"' },
      body: JSON.stringify({ reason: "late" }),
    })
    expect(response).toEqual({ status: 200, data: { id: "1" }, etag: '"4"', location: undefined })
  })

  it("returns the Location of a queued job", async () => {
    respond(202, undefined, { Location: "/api/jobs/orders/7" })

    const response = await sendAction({ href: "/api/orders/1/export", method: "POST" })

    expect(response.location).toBe("/api/jobs/orders/7")
    expect(response.data).toBeUndefined()
  })

  it("throws the Problem Details of a refused action", async () => {
    respond(409, { type: "/problems/orders/already-shipped", title: "Already shipped", status: 409 })

    const failure = sendAction({ href: "/api/orders/1/cancel", method: "POST" })

    await expect(failure).rejects.toBeInstanceOf(ProblemError)
    await expect(failure).rejects.toMatchObject({ problem: { type: "/problems/orders/already-shipped" } })
  })

  it("follows a link and returns its representation", async () => {
    respond(200, { items: [], _links: { self: { href: "/api/orders?page=2" } } })

    const page = await followLink<{ items: unknown[] }>({ href: "/api/orders?page=2" })

    expect(page.items).toEqual([])
  })
})
