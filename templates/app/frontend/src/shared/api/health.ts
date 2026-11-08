import { useQuery } from '@tanstack/react-query'

import { api } from './client'

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/api/health', { signal })
      if (!data) throw error
      return data
    },
  })
}
