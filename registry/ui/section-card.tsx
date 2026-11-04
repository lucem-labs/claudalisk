import * as React from "react"

import { Card, CardAction, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Heading, type HeadingLevel } from "@/components/ui/heading"

type SectionCardProps = Omit<React.ComponentProps<typeof Card>, "title"> & {
  title: React.ReactNode
  region?: boolean
  level?: HeadingLevel
  description?: React.ReactNode
  action?: React.ReactNode
}

function SectionCard({ title, region = false, level = 2, description, action, children, ...props }: SectionCardProps) {
  const headingId = React.useId()
  return (
    <Card role={region ? "region" : undefined} aria-labelledby={region ? headingId : undefined} {...props}>
      <CardHeader>
        <Heading id={headingId} level={level}>
          {title}
        </Heading>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export { SectionCard }
