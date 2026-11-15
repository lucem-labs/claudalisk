import { describe, expect, it } from 'vitest'

import * as entity from '@/entities/order'

describe('the order total', () => {
  it('is exported as orderTotal and no longer as calculateTotal', () => {
    expect('calculateTotal' in entity).toBe(false)
    const order = { id: '1', name: 'First', version: 1, lines: [{ sku: 'a', quantity: 2, unitPrice: 5 }, { sku: 'b', quantity: 1, unitPrice: 2.5 }] }
    expect(entity.orderTotal(order)).toBe(12.5)
  })
})
