import * as React from "react"
import { CircleAlert } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { problemOf, unmatchedFieldErrors } from "@/lib/problem-details"

type ProblemAlertProps = {
  error: unknown
  fields?: readonly string[]
  action?: React.ReactNode
}

function ProblemAlert({ error, fields, action }: ProblemAlertProps) {
  if (!error) return null
  const problem = problemOf(error)
  const title = problem?.title ?? "Something went wrong"
  const detail = problem?.detail ?? (problem ? undefined : errorMessage(error))
  const extra = fields ? unmatchedFieldErrors(error, fields) : []

  return (
    <Alert variant="destructive" data-problem-type={problem?.type}>
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {detail ? <p>{detail}</p> : null}
        {extra.length > 0 ? (
          <ul className="list-inside list-disc">
            {extra.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
        {action}
      </AlertDescription>
    </Alert>
  )
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : undefined
}

export { ProblemAlert }
