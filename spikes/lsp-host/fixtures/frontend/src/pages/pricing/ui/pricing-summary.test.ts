import { expect, test } from 'vitest'
import { summarize } from '../index'

test('the summary lists the count and the total', () => {
  expect(summarize([{ amount: 1, currency: 'EUR' }, { amount: 2.5, currency: 'EUR' }])).toBe('2 items, 3.50 EUR')
})
