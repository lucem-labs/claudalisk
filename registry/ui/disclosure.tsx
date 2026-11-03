import * as React from "react"
import { ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "cn"

type DisclosureProps = Omit<React.ComponentProps<typeof Collapsible>, "children"> & {
  trigger: React.ReactNode
  children: React.ReactNode
}

function Disclosure({ trigger, children, className, ...props }: DisclosureProps) {
  return (
    <Collapsible className={cn("flex flex-col gap-2", className)} {...props}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="group/disclosure w-fit justify-start gap-2 px-2">
          <ChevronRight
            aria-hidden
            className="transition-transform group-data-[state=open]/disclosure:rotate-90"
          />
          {trigger}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}

export { Disclosure }
