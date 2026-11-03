import { Button } from "@/components/ui/button"
import type { Links } from "@/lib/hypermedia"

type PagerProps = {
  links: Links | undefined
  onNavigate: (href: string) => void
  page?: number
  pageCount?: number
  label?: string
}

function Pager({ links, onNavigate, page, pageCount, label = "Pages" }: PagerProps) {
  const prev = links?.prev
  const next = links?.next
  if (!prev && !next) return null

  return (
    <nav aria-label={label} className="flex items-center justify-end gap-2">
      {page !== undefined ? (
        <p className="mr-auto text-sm text-muted-foreground">
          {pageCount !== undefined ? `Page ${page} of ${pageCount}` : `Page ${page}`}
        </p>
      ) : null}
      <Button variant="outline" size="sm" disabled={!prev} onClick={() => prev && onNavigate(prev.href)}>
        Previous
      </Button>
      <Button variant="outline" size="sm" disabled={!next} onClick={() => next && onNavigate(next.href)}>
        Next
      </Button>
    </nav>
  )
}

export { Pager }
