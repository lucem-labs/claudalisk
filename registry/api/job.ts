import { useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query"

import type { Link } from "@/lib/hypermedia"
import { isActive, isSuperseded, type Job } from "@/lib/job"
import { followLink } from "@/shared/api/hypermedia"

export type UseJobOptions = {
  findActive?: () => Promise<Link | undefined>
  start?: () => Promise<Link>
  invalidates?: readonly QueryKey[]
  interval?: number
}

const MAX_HOPS = 3

const startedFor = new WeakMap<QueryClient, Map<string, Promise<Link>>>()

export const jobQueryKeys = ["claudalisk", "job"] as const

export function jobQueryKey(link: Link | undefined): QueryKey {
  return [...jobQueryKeys, link?.href]
}

function startOnce(queryClient: QueryClient, superseded: Job, start: () => Promise<Link>): Promise<Link> {
  const started = startedFor.get(queryClient) ?? new Map<string, Promise<Link>>()
  startedFor.set(queryClient, started)
  const key = superseded._links?.self?.href ?? superseded.id
  const existing = started.get(key)
  if (existing) return existing
  const pending = start()
  started.set(key, pending)
  pending.catch(() => started.delete(key))
  return pending
}

export function useJob(
  link: Link | undefined,
  { findActive, start, invalidates = [], interval = 1000 }: UseJobOptions = {}
) {
  const queryClient = useQueryClient()
  const queryKey = jobQueryKey(link)
  return useQuery({
    queryKey,
    enabled: link !== undefined,
    queryFn: async ({ signal }) => {
      const previous = queryClient.getQueryData<Job>(queryKey)
      const current = previous?._links?.self ?? link
      if (!current) throw new Error("There is no job to follow.")
      let job = await followLink<Job>(current, { signal })
      for (let hop = 0; hop < MAX_HOPS && isSuperseded(job); hop++) {
        const active = await findActive?.()
        const replacement = active ?? (start ? await startOnce(queryClient, job, start) : undefined)
        if (!replacement) break
        job = await followLink<Job>(replacement, { signal })
      }
      if (!isActive(job) && (previous === undefined || isActive(previous))) {
        for (const key of invalidates) void queryClient.invalidateQueries({ queryKey: key }, { cancelRefetch: false })
      }
      return job
    },
    refetchInterval: (query) => (isActive(query.state.data) ? interval : false),
  })
}
