import { describe, expect, it } from 'vitest'

import { biggestOrder } from './biggest-order'

describe('biggestOrder', () => {
  it('picks the order with the highest total', () => {
    const small = { id: '1', name: 'Small', version: 1, lines: [{ sku: 'a', quantity: 1, unitPrice: 1 }] }
    const large = { id: '2', name: 'Large', version: 1, lines: [{ sku: 'b', quantity: 4, unitPrice: 3 }] }
    expect(biggestOrder([small, large])).toBe(large)
  })

  it('has none when there are no orders', () => {
    expect(biggestOrder([])).toBeUndefined()
  })
})
