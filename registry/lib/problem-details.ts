export type ProblemDetails = {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
  errors?: Record<string, string[]>
}

export class ProblemError extends Error {
  readonly problem: ProblemDetails

  constructor(problem: ProblemDetails) {
    super(messageOf(problem) ?? "The request failed.")
    this.name = "ProblemError"
    this.problem = problem
  }
}

export function isProblemDetails(value: unknown): value is ProblemDetails {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.title === "string" ||
    typeof candidate.type === "string" ||
    typeof candidate.status === "number"
  )
}

export function problemOf(error: unknown): ProblemDetails | undefined {
  if (error instanceof ProblemError) return error.problem
  if (isProblemDetails(error)) return error
  return undefined
}

export function problemMessage(error: unknown): string | undefined {
  const problem = problemOf(error)
  if (problem) return messageOf(problem)
  return error instanceof Error ? error.message : undefined
}

export function fieldErrors(error: unknown, field: string): string[] {
  const errors = problemOf(error)?.errors
  if (!errors) return []
  const wanted = fieldKey(field)
  return Object.entries(errors)
    .filter(([key]) => fieldKey(key) === wanted)
    .flatMap(([, messages]) => messages)
}

export function unmatchedFieldErrors(error: unknown, fields: readonly string[]): string[] {
  const errors = problemOf(error)?.errors
  if (!errors) return []
  const known = new Set(fields.map(fieldKey))
  return Object.entries(errors)
    .filter(([key]) => !known.has(fieldKey(key)))
    .flatMap(([, messages]) => messages)
}

function messageOf(problem: ProblemDetails): string | undefined {
  return problem.detail ?? Object.values(problem.errors ?? {}).flat()[0] ?? problem.title
}

function fieldKey(key: string): string {
  return key.replace(/^\$\./, "").toLowerCase()
}
