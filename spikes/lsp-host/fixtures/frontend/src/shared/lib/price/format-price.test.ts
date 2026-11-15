import { expect, test } from 'vitest'
import { formatPrice, totalPrice } from './format-price'

test('a price is formatted with two decimals', () => {
  expect(formatPrice({ amount: 3.5, currency: 'EUR' })).toBe('3.50 EUR')
})

test('prices add up', () => {
  expect(totalPrice([{ amount: 1, currency: 'EUR' }, { amount: 2, currency: 'EUR' }]).amount).toBe(3)
})
