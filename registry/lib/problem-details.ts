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
    super(problem.detail ?? problem.title ?? "The request failed.")
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

export function fieldErrors(error: unknown, field: string): string[] {
  const errors = problemOf(error)?.errors
  if (!errors) return []
  const wanted = field.toLowerCase()
  return Object.entries(errors)
    .filter(([key]) => key.toLowerCase() === wanted)
    .flatMap(([, messages]) => messages)
}

export function unmatchedFieldErrors(error: unknown, fields: readonly string[]): string[] {
  const errors = problemOf(error)?.errors
  if (!errors) return []
  const known = new Set(fields.map((field) => field.toLowerCase()))
  return Object.entries(errors)
    .filter(([key]) => !known.has(key.toLowerCase()))
    .flatMap(([, messages]) => messages)
}
