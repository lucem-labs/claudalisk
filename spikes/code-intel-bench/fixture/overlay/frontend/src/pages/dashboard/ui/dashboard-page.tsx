import type { Order } from '@/entities/order'
import { boardTotal, OrderBoard } from '@/widgets/order-board'

export function DashboardPage({ orders }: { orders: readonly Order[] }) {
  return (
    <>
      <OrderBoard orders={orders} />
      <p>{orders.length} orders worth {boardTotal(orders).toFixed(2)}</p>
    </>
  )
}
