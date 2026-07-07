// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
    handlers: [] as Array<(msg: any) => void>,
    sent: [] as any[],
    channelObj: null as any,
}))

vi.mock('../lib/supabase', () => {
    h.channelObj = {
        on: vi.fn((_t: string, _f: any, cb: (msg: any) => void) => { h.handlers.push(cb); return h.channelObj }),
        subscribe: vi.fn(() => h.channelObj),
        send: vi.fn((msg: any) => { h.sent.push(msg) }),
    }
    return { supabase: { channel: vi.fn(() => h.channelObj), removeChannel: vi.fn() } }
})

import { initRealtimeSync, announceSave } from '../lib/realtimeSync'

beforeEach(() => { h.handlers.length = 0; h.sent.length = 0 })

describe('realtimeSync (Paso 3)', () => {
    it('a remote save ping triggers the refresh callback with its ts', () => {
        const seen: Array<string | null> = []
        const cleanup = initRealtimeSync(ts => { seen.push(ts) })
        h.handlers.forEach(fn => fn({ payload: { ts: '2026-07-07T21:00:00.000Z' } }))
        expect(seen).toEqual(['2026-07-07T21:00:00.000Z'])
        cleanup()
    })

    it('announceSave broadcasts the save timestamp', () => {
        const cleanup = initRealtimeSync(() => {})
        announceSave('2026-07-07T21:01:00.000Z')
        expect(h.sent).toHaveLength(1)
        expect(h.sent[0]).toMatchObject({ type: 'broadcast', event: 'state-saved', payload: { ts: '2026-07-07T21:01:00.000Z' } })
        cleanup()
    })

    it('announceSave is a no-op when realtime is not initialized (never breaks a save)', () => {
        expect(() => announceSave('2026-07-07T21:02:00.000Z')).not.toThrow()
    })
})
