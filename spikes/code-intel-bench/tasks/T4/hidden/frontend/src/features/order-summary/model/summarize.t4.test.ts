import { describe, expect, it } from 'vitest'

import { summarizeOrder } from './summarize'

describe('summarizeOrder after the rename', () => {
  it('still reports the total', () => {
    const order = { id: '1', name: 'First', version: 1, lines: [{ sku: 'a', quantity: 3, unitPrice: 2 }, { sku: 'b', quantity: 1, unitPrice: 0.5 }] }
    expect(summarizeOrder(order)).toBe('First: 2 lines, total 6.50')
  })
})
