import { describe, expect, it } from 'vitest'

import { orderToCsvRow } from './to-csv'

describe('orderToCsvRow after the rename', () => {
  it('still writes the total', () => {
    const order = { id: '7', name: 'Seventh', version: 1, lines: [{ sku: 'a', quantity: 5, unitPrice: 1.2 }] }
    expect(orderToCsvRow(order)).toBe('7,Seventh,6.00')
  })
})
