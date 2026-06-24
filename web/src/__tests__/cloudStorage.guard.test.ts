// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })) })) })),
      upsert: vi.fn(async () => ({ error: null })),
    })),
    rpc: vi.fn(async () => ({ data: { conflict: false }, error: null })),
  }
}))

import { cloudStorage } from '../store/cloudStorage'
import { supabase } from '../lib/supabase'

describe('cloudStorage initialization guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('setItem does NOT call supabase.rpc when state.initialized is false', async () => {
    const payload = JSON.stringify({
      state: { initialized: false, transactions: [], inventory: [] },
      version: 13
    })

    await cloudStorage.setItem('jardin-erp-storage-v4', payload)

    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})
