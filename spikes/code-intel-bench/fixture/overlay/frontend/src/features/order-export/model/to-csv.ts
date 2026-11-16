import { calculateTotal, type Order } from '@/entities/order'

export function orderToCsvRow(order: Order): string {
  return [order.id, order.name, calculateTotal(order).toFixed(2)].join(',')
}

export function ordersToCsv(orders: readonly Order[]): string {
  return ['id,name,total', ...orders.map(orderToCsvRow)].join('\n')
}
