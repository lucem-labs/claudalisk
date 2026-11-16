import { calculateTotal, type Order } from '@/entities/order'

export function summarizeOrder(order: Order): string {
  return `${order.name}: ${order.lines.length} lines, total ${calculateTotal(order).toFixed(2)}`
}
