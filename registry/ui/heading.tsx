import * as React from "react"

import { cn } from "cn"

type HeadingLevel = 1 | 2 | 3 | 4

const LEVEL_CLASSES: Record<HeadingLevel, string> = {
  1: "text-2xl font-semibold",
  2: "text-xl font-semibold",
  3: "text-lg font-medium",
  4: "text-base font-medium",
}

type HeadingProps = React.ComponentProps<"h2"> & {
  level?: HeadingLevel
}

function Heading({ level = 2, className, ...props }: HeadingProps) {
  const Tag = `h${level}` as const
  return (
    <Tag
      data-slot="heading"
      className={cn("font-heading tracking-tight text-foreground", LEVEL_CLASSES[level], className)}
      {...props}
    />
  )
}

type PageHeaderProps = Omit<React.ComponentProps<"header">, "title"> & {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}

function PageHeader({ title, description, actions, className, ...props }: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn("flex flex-wrap items-start justify-between gap-4", className)}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Heading level={1}>{title}</Heading>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export { Heading, PageHeader }
export type { HeadingLevel }
