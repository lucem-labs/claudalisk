import { isProblemDetails, ProblemError } from "@/lib/problem-details"
import type { Action, Link } from "@/lib/hypermedia"

export type ActionRequest = {
  body?: unknown
  ifMatch?: string
}

export type ActionResponse<T> = {
  status: number
  data: T | undefined
  etag: string | undefined
  location: string | undefined
}

export async function followLink<T>(link: Link, init?: { signal?: AbortSignal }): Promise<T> {
  const response = await fetch(link.href, {
    headers: { Accept: "application/json" },
    signal: init?.signal,
  })
  const { data } = await readResponse<T>(response)
  return data as T
}

export async function sendAction<T = unknown>(
  action: Action,
  request: ActionRequest = {}
): Promise<ActionResponse<T>> {
  const headers: Record<string, string> = { Accept: "application/json" }
  if (request.body !== undefined) headers["Content-Type"] = "application/json"
  if (request.ifMatch !== undefined) headers["If-Match"] = request.ifMatch
  const response = await fetch(action.href, {
    method: action.method,
    headers,
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  })
  return readResponse<T>(response)
}

async function readResponse<T>(response: Response): Promise<ActionResponse<T>> {
  const body = parseBody(await response.text())
  if (!response.ok) {
    throw new ProblemError(
      isProblemDetails(body) ? body : { status: response.status, title: response.statusText }
    )
  }
  return {
    status: response.status,
    data: body as T | undefined,
    etag: response.headers.get("ETag") ?? undefined,
    location: response.headers.get("Location") ?? undefined,
  }
}

function parseBody(text: string): unknown {
  if (text.length === 0) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
