import { calculateTotal, type Order } from '@/entities/order'

export function biggestOrder(orders: readonly Order[]): Order | undefined {
  return [...orders].sort((left, right) => calculateTotal(right) - calculateTotal(left))[0]
}
