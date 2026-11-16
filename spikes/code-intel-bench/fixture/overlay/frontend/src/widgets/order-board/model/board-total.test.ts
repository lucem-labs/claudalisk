import { describe, expect, it } from 'vitest'

import { boardTotal } from './board-total'

describe('boardTotal', () => {
  it('adds up the total of every order on the board', () => {
    const orders = [
      { id: '1', name: 'First', version: 1, lines: [{ sku: 'a', quantity: 2, unitPrice: 4 }] },
      { id: '2', name: 'Second', version: 1, lines: [{ sku: 'b', quantity: 1, unitPrice: 1.5 }] },
    ]
    expect(boardTotal(orders)).toBe(9.5)
  })
})
