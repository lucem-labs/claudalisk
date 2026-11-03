import type { Representation } from "@/lib/hypermedia"
import type { ProblemDetails } from "@/lib/problem-details"

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled"

export type JobProgress = {
  fraction: number | null
  step: string | null
}

export type Job = Representation & {
  id: string
  module: string
  kind: string
  status: JobStatus
  attempts: number
  maxAttempts: number
  progress: JobProgress
  error: ProblemDetails | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export const SUPERSEDED_PROBLEM_TYPE = "/problems/jobs/superseded"

export function isActive(job: Job | undefined): boolean {
  return job?.status === "queued" || job?.status === "running"
}

export function isSuperseded(job: Job | undefined): boolean {
  return job?.status === "canceled" && job.error?.type === SUPERSEDED_PROBLEM_TYPE
}
