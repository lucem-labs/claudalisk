import { describe, expect, it } from 'vitest'

import { biggestOrder } from './biggest-order'

describe('biggestOrder after the rename', () => {
  it('still ranks by the total', () => {
    const cheap = { id: '1', name: 'Cheap', version: 1, lines: [{ sku: 'a', quantity: 10, unitPrice: 1 }] }
    const dear = { id: '2', name: 'Dear', version: 1, lines: [{ sku: 'b', quantity: 1, unitPrice: 11 }] }
    expect(biggestOrder([cheap, dear])).toBe(dear)
  })
})
