import { describe, expect, it } from 'vitest'

import { slugify } from './slugify'

describe('slugify', () => {
  it('lowercases and joins words with single hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world')
    expect(slugify('  Many   spaces  here ')).toBe('many-spaces-here')
  })

  it('drops punctuation and keeps digits', () => {
    expect(slugify('Order #42: paid!')).toBe('order-42-paid')
  })

  it('strips accents', () => {
    expect(slugify('Crème Brûlée')).toBe('creme-brulee')
  })

  it('gives an empty string when nothing is left', () => {
    expect(slugify('***')).toBe('')
    expect(slugify('')).toBe('')
  })
})
