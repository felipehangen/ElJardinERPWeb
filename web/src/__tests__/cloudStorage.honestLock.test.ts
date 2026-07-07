// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Honest optimistic lock: the write baseline must come from the SNAPSHOT being
// saved (state._baseCloudTs, stamped at hydration), never from a module variable
// updated when data arrives from the network. Regression suite for the
// 2026-07-07 incident: a physical-count transaction was erased from the cloud
// log by a save that carried old in-memory state with a fresh network-read ts.

const h = vi.hoisted(() => ({
    cloudDoc: { value: null as any },
    rpcCalls: [] as Array<Record<string, unknown>>,
    rpcResult: { value: { data: { conflict: false }, error: null } as any },
    rpcGate: { value: null as null | Promise<void> },
    upsert: vi.fn(async () => ({ error: null })),
}))

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: () => ({
            select: () => ({ eq: () => ({ single: async () => ({ data: h.cloudDoc.value, error: null }) }) }),
            upsert: h.upsert,
            delete: () => ({ eq: async () => ({ error: null }) }),
        }),
        rpc: async (_fn: string, args: Record<string, unknown>) => {
            h.rpcCalls.push(args)
            if (h.rpcGate.value) await h.rpcGate.value
            return h.rpcResult.value
        },
    },
}))

import { cloudStorage, forceRefreshFromCloud } from '../store/cloudStorage'

const KEY = 'jardin-erp-storage-v4'
const T0 = '2026-07-07T19:00:00.000Z'
const T2 = '2026-07-07T19:30:00.000Z'

beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    h.cloudDoc.value = null
    h.rpcCalls.length = 0
    h.rpcResult.value = { data: { conflict: false }, error: null }
    h.rpcGate.value = null
})

describe('honest optimistic lock (baseline travels inside the snapshot)', () => {
    it("uses the snapshot's _baseCloudTs even after a fresh cloud read saw a newer version", async () => {
        // The network layer fetches a NEWER cloud copy (T2)…
        h.cloudDoc.value = { data_json: { _savedAt: T2, state: { initialized: true, transactions: [] } } }
        await forceRefreshFromCloud()

        // …but the state being saved still descends from T0 (rehydrate hasn't
        // landed the new data). The save must present T0 as its baseline — with
        // the old module-level ts it would have (dishonestly) presented T2.
        const staleSnapshot = JSON.stringify({
            state: { initialized: true, _baseCloudTs: T0 },
            version: 13,
        })
        h.rpcResult.value = { data: { conflict: true, cloud_ts: T2 }, error: null }
        let conflictFired = false
        window.addEventListener('erp-cloud-conflict', () => { conflictFired = true }, { once: true })

        await cloudStorage.setItem(KEY, staleSnapshot)

        expect(h.rpcCalls.length).toBe(1)
        expect(h.rpcCalls[0].p_last_known_ts).toBe(T0)
        expect(conflictFired).toBe(true)
        expect(h.upsert).not.toHaveBeenCalled()
    })

    it('advances the baseline after our own successful save', async () => {
        const snapshot = JSON.stringify({ state: { initialized: true, _baseCloudTs: T0 }, version: 13 })
        await cloudStorage.setItem(KEY, snapshot)
        await cloudStorage.setItem(KEY, snapshot)

        expect(h.rpcCalls.length).toBe(2)
        expect(h.rpcCalls[0].p_last_known_ts).toBe(T0)
        // Second save's baseline = the _savedAt injected into the first save.
        const firstSavedAt = (h.rpcCalls[0].p_data as Record<string, unknown>)._savedAt
        expect(h.rpcCalls[1].p_last_known_ts).toBe(firstSavedAt)
    })

    it('serializes concurrent saves (mutex): the second waits for the first', async () => {
        let releaseFirst: () => void = () => {}
        h.rpcGate.value = new Promise<void>(r => { releaseFirst = r })

        const snapshot = JSON.stringify({ state: { initialized: true, _baseCloudTs: T0 }, version: 13 })
        const first = cloudStorage.setItem(KEY, snapshot)
        const second = cloudStorage.setItem(KEY, snapshot)
        await new Promise(r => setTimeout(r, 0))

        // First RPC is in flight and gated; the second must NOT have started.
        expect(h.rpcCalls.length).toBe(1)

        h.rpcGate.value = null
        releaseFirst()
        await first
        await second
        expect(h.rpcCalls.length).toBe(2)
    })

    it('getItem stamps the hydrated snapshot with the cloud version it incorporates', async () => {
        h.cloudDoc.value = {
            data_json: { _savedAt: T2, state: { initialized: true, transactions: [] }, version: 13 },
        }
        const result = await cloudStorage.getItem(KEY)
        const parsed = JSON.parse(result as string)
        expect(parsed.state._baseCloudTs).toBe(T2)
    })
})
