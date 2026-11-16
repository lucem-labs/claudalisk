import type { Order } from '@/entities/order'
import { ordersToCsv } from '@/features/order-export'
import { summarizeOrder } from '@/features/order-summary'

import { boardTotal } from '../model/board-total'

export function OrderBoard({ orders }: { orders: readonly Order[] }) {
  return (
    <section>
      <ul>
        {orders.map((order) => (
          <li key={order.id}>{summarizeOrder(order)}</li>
        ))}
      </ul>
      <p>Board total {boardTotal(orders).toFixed(2)}</p>
      <pre>{ordersToCsv(orders)}</pre>
    </section>
  )
}
