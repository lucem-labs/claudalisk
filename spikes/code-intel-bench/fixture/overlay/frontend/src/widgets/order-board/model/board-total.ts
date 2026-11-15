import { calculateTotal, type Order } from '@/entities/order'

export function boardTotal(orders: readonly Order[]): number {
  return orders.reduce((sum, order) => sum + calculateTotal(order), 0)
}
