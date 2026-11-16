import { OrderTitle, useOrder, type Order } from '@/entities/order'
import { ordersToCsv } from '@/features/order-export'
import { summarizeOrder } from '@/features/order-summary'
import { OrderBoard } from '@/widgets/order-board'

import { biggestOrder } from '../model/biggest-order'

export function OrdersPage({ orders, focusId }: { orders: readonly Order[]; focusId: string }) {
  const focus = useOrder(focusId)
  const biggest = biggestOrder(orders)
  return (
    <>
      {focus.data ? <OrderTitle response={{ id: focus.data.id, name: focus.data.name, version: focus.data.version, _links: {}, _actions: {} }} /> : null}
      <OrderBoard orders={orders} />
      {biggest ? <p>Biggest: {summarizeOrder(biggest)}</p> : null}
      <a href={`data:text/csv,${encodeURIComponent(ordersToCsv(orders))}`}>Download</a>
    </>
  )
}
