import { useQuery } from '@tanstack/react-query'

import { api } from '@/shared/api'

import { toOrder } from '../model/order'

export function useOrder(id: string) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/api/orders/{id}', { params: { path: { id } }, signal })
      if (!data) throw error
      return toOrder(data)
    },
  })
}
