import { describe, expect, it } from 'vitest'

import { ordersToCsv } from './to-csv'

describe('ordersToCsv', () => {
  it('writes a header and one row per order with its total', () => {
    const orders = [
      { id: '1', name: 'First', version: 1, lines: [{ sku: 'a', quantity: 2, unitPrice: 4 }] },
      { id: '2', name: 'Second', version: 1, lines: [] },
    ]
    expect(ordersToCsv(orders)).toBe('id,name,total\n1,First,8.00\n2,Second,0.00')
  })
})
