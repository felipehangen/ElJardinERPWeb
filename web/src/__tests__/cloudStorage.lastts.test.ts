// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Controlled upsert: we hold a resolver so the test can control when the
// upsert promise resolves, making the race window deterministic.
let resolveUpsert: ((v: { error: null }) => void) | null = null

vi.mock('../lib/supabase', () => {
  let rpcCallCount = 0
  const rpc = vi.fn(async (..._args: unknown[]) => {
    rpcCallCount++
    if (rpcCallCount === 1) throw new Error('RPC unavailable')
    return { data: { conflict: false }, error: null }
  })
  ;(rpc as unknown as { _reset: () => void })._reset = () => { rpcCallCount = 0 }

  return {
    supabase: {
      from: vi.fn(() => ({
        // Upsert is controllable: it holds until resolveUpsert() is called.
        upsert: vi.fn(() => new Promise<{ error: null }>(res => { resolveUpsert = res })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
      rpc,
    },
  }
})

import { cloudStorage } from '../store/cloudStorage'
import { supabase } from '../lib/supabase'

describe('cloudStorage lastKnownCloudTs sync update', () => {
  beforeEach(() => {
    resolveUpsert = null
    localStorage.clear()
    ;(supabase.rpc as unknown as { _reset: () => void })._reset()
    let callCount = 0
    vi.mocked(supabase.rpc).mockReset()
    vi.mocked(supabase.rpc).mockImplementation(async (..._args: unknown[]) => {
      callCount++
      if (callCount === 1) throw new Error('RPC unavailable')
      return { data: { conflict: false }, error: null }
    })
  })

  it('second setItem passes a non-null p_last_known_ts even before the fallback upsert resolves', async () => {
    const payload1 = JSON.stringify({
      state: { initialized: true },
      version: 13,
      _savedAt: '2026-01-01T00:00:00.000Z',
    })

    // Start the first setItem but do NOT await it yet.
    // It will: call rpc (throws) → enter catch → call upsert (which HANGS until
    // we call resolveUpsert). The .then() on the upsert will only run after we
    // release the upsert promise.
    const firstSave = cloudStorage.setItem('jardin-erp-storage-v4', payload1)

    // Yield to the microtask queue so the first setItem can progress up to
    // the point where it is blocked on the upsert promise.
    await new Promise(r => setTimeout(r, 0))

    // At this point: first setItem is suspended waiting for the upsert.
    // The upsert .then() has NOT fired yet — resolveUpsert has not been called.
    // In buggy code: lastKnownCloudTs is still undefined.
    // In fixed code: lastKnownCloudTs was updated synchronously before the upsert call.

    const payload2 = JSON.stringify({ state: { initialized: true }, version: 13 })
    await cloudStorage.setItem('jardin-erp-storage-v4', payload2)

    // Now release the first upsert so the test can clean up
    resolveUpsert?.({ error: null })
    await firstSave

    const calls = vi.mocked(supabase.rpc).mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(2)

    const secondCallArgs = calls[1]
    const p_last_known_ts = (secondCallArgs[1] as Record<string, unknown>)?.p_last_known_ts

    // With the bug: lastKnownCloudTs was still undefined when the second setItem
    // read it → p_last_known_ts === null.
    // With the fix: lastKnownCloudTs was set synchronously in the catch block →
    // p_last_known_ts is a non-null ISO timestamp string.
    expect(p_last_known_ts).not.toBeNull()
    expect(p_last_known_ts).not.toBeUndefined()
    expect(typeof p_last_known_ts).toBe('string')
    expect(p_last_known_ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
