import { formatPrice, totalPrice } from '@/shared/lib/price'
import type { Price } from '@/shared/lib/price'

export function summarize(prices: Price[]): string {
  return `${prices.length} items, ${formatPrice(totalPrice(prices))}`
}
