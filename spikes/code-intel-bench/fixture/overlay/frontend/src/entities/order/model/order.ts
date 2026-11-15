import type { components } from '@/shared/api'

export type OrderResponse = components['schemas']['OrderResponse']

export type OrderLine = {
  sku: string
  quantity: number
  unitPrice: number
}

export type Order = {
  id: string
  name: string
  version: number
  lines: readonly OrderLine[]
}

export function toOrder(response: OrderResponse, lines: readonly OrderLine[] = []): Order {
  return { id: response.id, name: response.name, version: response.version, lines }
}

export function labelOf(response: OrderResponse): string {
  return response.name.trim()
}

export function calculateTotal(order: Order): number {
  return order.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
}
