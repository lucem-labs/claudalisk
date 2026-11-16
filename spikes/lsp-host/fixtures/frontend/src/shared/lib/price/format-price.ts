import type { Price } from './model'

export function formatPrice(price: Price): string {
  return `${price.amount.toFixed(2)} ${price.currency}`
}

export function totalPrice(prices: Price[]): Price {
  return { amount: prices.reduce((sum, price) => sum + price.amount, 0), currency: prices[0]?.currency ?? 'EUR' }
}
