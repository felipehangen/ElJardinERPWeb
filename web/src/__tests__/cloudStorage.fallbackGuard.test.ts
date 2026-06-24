// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Shared mock state so tests can vary the cloud doc and the rpc behavior.
const h = vi.hoisted(() => ({
    cloudDoc: { value: null as any },
    upsert: vi.fn(async () => ({ error: null })),
    rpcThrows: { on: false },
}))

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: () => ({
            select: () => ({ eq: () => ({ single: async () => ({ data: h.cloudDoc.value, error: null }) }) }),
            upsert: h.upsert,
            delete: () => ({ eq: async () => ({ error: null }) }),
        }),
        rpc: async () => {
            if (h.rpcThrows.on) throw new Error('network down')
            return { data: { conflict: false }, error: null }
        },
    },
}))

import { cloudStorage } from '../store/cloudStorage'

const KEY = 'jardin-erp-storage-v4'
const initializedPayload = JSON.stringify({ state: { initialized: true }, version: 13 })

beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    h.cloudDoc.value = null
    h.rpcThrows.on = false
})

describe('cloudStorage fallback guard (#3)', () => {
    it('aborts the direct upsert when the cloud was updated externally since our last load', async () => {
        // 1. Load: records lastKnownCloudTs = T1
        h.cloudDoc.value = { data_json: { _savedAt: '2026-06-01T00:00:00.000Z' } }
        await cloudStorage.getItem(KEY)

        // 2. External update bumps the cloud to T2 (newer), and the RPC path fails
        h.cloudDoc.value = { data_json: { _savedAt: '2026-06-02T00:00:00.000Z' } }
        h.rpcThrows.on = true

        let conflictFired = false
        window.addEventListener('erp-cloud-conflict', () => { conflictFired = true }, { once: true })

        // 3. Save → RPC throws → guarded fallback sees newer cloud → must NOT overwrite
        await cloudStorage.setItem(KEY, initializedPayload)

        expect(conflictFired).toBe(true)
        expect(h.upsert).not.toHaveBeenCalled()
    })

    it('awaits and performs the direct upsert when there is no conflict', async () => {
        h.cloudDoc.value = { data_json: { _savedAt: '2026-06-01T00:00:00.000Z' } }
        await cloudStorage.getItem(KEY)

        h.rpcThrows.on = true // force fallback, cloud unchanged (still T1)

        await cloudStorage.setItem(KEY, initializedPayload)

        // No newer cloud ts → fallback writes (and is awaited, so it ran by now)
        expect(h.upsert).toHaveBeenCalledTimes(1)
    })
})
