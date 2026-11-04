import * as React from "react"

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { fieldErrors } from "@/lib/problem-details"

type ProblemFieldProps = {
  name: string
  label: React.ReactNode
  error: unknown
  description?: React.ReactNode
  children: React.ReactElement<{ id?: string; name?: string; "aria-invalid"?: boolean }>
}

function ProblemField({ name, label, error, description, children }: ProblemFieldProps) {
  const id = React.useId()
  const messages = fieldErrors(error, name)
  const invalid = messages.length > 0
  const control = React.cloneElement(children, {
    id,
    name,
    "aria-invalid": invalid || undefined,
  })

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {control}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {invalid ? <FieldError errors={messages.map((message) => ({ message }))} /> : null}
    </Field>
  )
}

export { ProblemField }
