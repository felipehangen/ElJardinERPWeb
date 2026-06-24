// @vitest-environment jsdom
import { vi, describe, it, expect, afterEach } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => new Promise(() => {})) })) })),
    })),
  }
}))

import { cloudStorage } from '../store/cloudStorage'

describe('cloudStorage timeout', () => {
  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it('getItem falls back to localStorage after 8s timeout', async () => {
    vi.useFakeTimers()

    localStorage.setItem(
      'jardin-erp-storage-v4',
      JSON.stringify({ _savedAt: '2026-01-01T00:00:00.000Z', state: { initialized: true } })
    )

    const promise = cloudStorage.getItem('jardin-erp-storage-v4')

    vi.advanceTimersByTime(8001)

    const result = await promise

    expect(result).not.toBeNull()
    expect(result).toContain('initialized')
  }, 10000)
})
