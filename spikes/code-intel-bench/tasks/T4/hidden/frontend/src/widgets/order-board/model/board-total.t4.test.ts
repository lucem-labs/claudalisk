import { describe, expect, it } from 'vitest'

import { boardTotal } from './board-total'

describe('boardTotal after the rename', () => {
  it('still adds the orders up', () => {
    const lines = [{ sku: 'a', quantity: 1, unitPrice: 10 }]
    expect(boardTotal([{ id: '1', name: 'A', version: 1, lines }, { id: '2', name: 'B', version: 1, lines }])).toBe(20)
  })
})
