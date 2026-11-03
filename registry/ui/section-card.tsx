import * as React from "react"

import { Card, CardAction, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Heading, type HeadingLevel } from "@/components/ui/heading"

type SectionCardProps = Omit<React.ComponentProps<typeof Card>, "title"> & {
  title: React.ReactNode
  label?: string
  level?: HeadingLevel
  description?: React.ReactNode
  action?: React.ReactNode
}

function SectionCard({ title, label, level = 2, description, action, children, ...props }: SectionCardProps) {
  return (
    <Card role={label ? "region" : undefined} aria-label={label} {...props}>
      <CardHeader>
        <Heading level={level}>{title}</Heading>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export { SectionCard }
