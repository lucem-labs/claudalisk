import * as React from "react"
import type { UseQueryResult } from "@tanstack/react-query"

import { ActionButton } from "@/components/ui/action-button"
import { ProblemAlert } from "@/components/ui/problem-alert"
import { Progress } from "@/components/ui/progress"
import { QueryLoading } from "@/components/ui/query-state"
import { isActive, type Job, type JobStatus } from "@/lib/job"

const STATUS_TEXT: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Done",
  failed: "Failed",
  canceled: "Canceled",
}

type JobPanelProps = {
  job: UseQueryResult<Job>
  label: string
  children?: (job: Job) => React.ReactNode
}

function JobPanel({ job: query, label, children }: JobPanelProps) {
  if (query.isPending) return <QueryLoading />
  if (query.isError) return <ProblemAlert error={query.error} />

  const job = query.data
  const active = isActive(job)
  const fraction = job.progress.fraction

  return (
    <section aria-label={label} data-job-status={job.status} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <p role="status" className="text-sm text-muted-foreground">
          {STATUS_TEXT[job.status]}
        </p>
      </div>
      {active ? (
        <Progress aria-label={`${label} progress`} value={fraction === null ? null : Math.round(fraction * 100)} />
      ) : null}
      {job.progress.step ? <p className="text-sm text-muted-foreground">{job.progress.step}</p> : null}
      {job.status === "failed" || job.status === "canceled" ? <ProblemAlert error={job.error ?? undefined} /> : null}
      <ActionButton
        representation={job}
        action="cancel"
        variant="outline"
        size="sm"
        className="self-start"
        onSuccess={() => void query.refetch()}
      >
        Cancel
      </ActionButton>
      {job.status === "succeeded" && children ? children(job) : null}
    </section>
  )
}

export { JobPanel }
