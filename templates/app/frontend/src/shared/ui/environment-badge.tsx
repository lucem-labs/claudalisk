import { useHealth } from '@/shared/api'
import { environmentLabel } from '@/shared/lib/environment-label'
import { Badge } from '@/shared/ui/badge'

export function EnvironmentBadge() {
  const health = useHealth()
  const environment = health.data?.environment
  if (!environment) return null
  return <Badge variant="secondary">{environmentLabel(environment)}</Badge>
}
