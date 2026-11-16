import type { OrderResponse } from '../model/order'

export function OrderTitle({ response }: { response: OrderResponse }) {
  return <h2>{response.name}</h2>
}
