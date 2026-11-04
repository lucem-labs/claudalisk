import * as React from "react"
import { useMutation } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { actionOf, type Representation } from "@/lib/hypermedia"
import { sendAction, type ActionResponse } from "@/shared/api/hypermedia"

type ActionButtonProps<T> = Omit<React.ComponentProps<typeof Button>, "onClick" | "onError"> & {
  representation: Representation | undefined
  action: string
  body?: unknown
  ifMatch?: string
  onSuccess?: (response: ActionResponse<T>) => void
  onError?: (error: unknown) => void
}

function ActionButton<T = unknown>({
  representation,
  action,
  body,
  ifMatch,
  onSuccess,
  onError,
  disabled,
  children,
  ...props
}: ActionButtonProps<T>) {
  const control = actionOf(representation, action)
  const mutation = useMutation({
    mutationFn: () => {
      if (!control) throw new Error(`The action ${action} is not available.`)
      return sendAction<T>(control, { body, ifMatch })
    },
    onSuccess,
    onError,
  })

  if (!control) return null

  return (
    <Button
      data-action={action}
      disabled={disabled || mutation.isPending}
      onClick={() => mutation.mutate()}
      {...props}
    >
      {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
      {children}
    </Button>
  )
}

export { ActionButton }
