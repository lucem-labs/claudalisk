import { useHealth } from '@/shared/api'
import { PageHeader } from '@/shared/ui/heading'
import { QueryState } from '@/shared/ui/query-state'

export function HomePage() {
  const health = useHealth()
  return (
    <>
      <PageHeader title="<AppName>" description="Replace this page with your first feature." />
      <QueryState query={health}>
        {(status) => <p>API status: {status.status}</p>}
      </QueryState>
    </>
  )
}
