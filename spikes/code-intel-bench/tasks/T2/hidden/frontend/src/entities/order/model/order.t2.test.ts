import { describe, expect, it } from 'vitest'

import { labelOf, toOrder } from './order'

const response = { id: '1', label: ' First ', version: 2, _links: {}, _actions: {} }

describe('an order response with a label', () => {
  it('maps the label to the name of the order', () => {
    expect(toOrder(response)).toEqual({ id: '1', name: ' First ', version: 2, lines: [] })
  })

  it('labels the response with its trimmed label', () => {
    expect(labelOf(response)).toBe('First')
  })
})
