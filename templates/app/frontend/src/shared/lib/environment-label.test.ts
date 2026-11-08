import { describe, expect, it } from 'vitest'

import { environmentLabel } from './environment-label'

describe('environmentLabel', () => {
  it('shows the environment the API reports in capitals', () => {
    expect(environmentLabel('dev')).toBe('DEV')
    expect(environmentLabel('uat')).toBe('UAT')
  })
})
