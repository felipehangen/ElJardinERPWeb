import { describe, it, expect } from 'vitest'
import { CLOUD_STORAGE_KEY } from '../store/cloudStorage'

describe('storage key consistency', () => {
  it('CLOUD_STORAGE_KEY matches the hardcoded string', () => {
    expect(CLOUD_STORAGE_KEY).toBe('jardin-erp-storage-v4')
  })
})
