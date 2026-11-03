import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"

import type { Link } from "@/lib/hypermedia"
import { isActive, isSuperseded, type Job } from "@/lib/job"
import { followLink } from "@/shared/api/hypermedia"

export type UseJobOptions = {
  findActive?: () => Promise<Link | undefined>
  start?: () => Promise<Link>
  invalidates?: readonly QueryKey[]
  interval?: number
}

export function jobQueryKey(link: Link | undefined): QueryKey {
  return ["claudalisk", "job", link?.href]
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
      const current = queryClient.getQueryData<Job>(queryKey)?._links?.self ?? link
      if (!current) throw new Error("There is no job to follow.")
      let job = await followLink<Job>(current, { signal })
      if (isSuperseded(job)) {
        const replacement = (await findActive?.()) ?? (await start?.())
        if (replacement) job = await followLink<Job>(replacement, { signal })
      }
      if (!isActive(job)) {
        await Promise.all(invalidates.map((key) => queryClient.invalidateQueries({ queryKey: key })))
      }
      return job
    },
    refetchInterval: (query) => (query.state.status === "success" && isActive(query.state.data) ? interval : false),
  })
}
