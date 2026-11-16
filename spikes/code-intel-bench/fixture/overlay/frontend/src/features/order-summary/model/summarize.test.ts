import { describe, expect, it } from 'vitest'

import { summarizeOrder } from './summarize'

describe('summarizeOrder', () => {
  it('names the order, its lines and its total', () => {
    const order = { id: '1', name: 'First', version: 1, lines: [{ sku: 'a', quantity: 3, unitPrice: 2 }] }
    expect(summarizeOrder(order)).toBe('First: 1 lines, total 6.00')
  })
})
