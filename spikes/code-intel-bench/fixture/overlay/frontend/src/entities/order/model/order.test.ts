import { describe, expect, it } from 'vitest'

import { calculateTotal, labelOf, toOrder } from './order'

const response = { id: '1', name: ' First ', version: 1, _links: {}, _actions: {} }

describe('order', () => {
  it('totals the quantity times the unit price of every line', () => {
    const order = toOrder(response, [
      { sku: 'a', quantity: 2, unitPrice: 5 },
      { sku: 'b', quantity: 1, unitPrice: 2.5 },
    ])
    expect(calculateTotal(order)).toBe(12.5)
  })

  it('maps the response to an order with no lines', () => {
    expect(toOrder(response)).toEqual({ id: '1', name: ' First ', version: 1, lines: [] })
  })

  it('labels a response with its trimmed name', () => {
    expect(labelOf(response)).toBe('First')
  })
})
