import { describe, it, expect } from 'vitest'
import { healInventoryFromLedger } from '../lib/inventoryLedger'
import type { Transaction, InventoryItem } from '../types'

// Authoritative healing: at rehydrate, any item whose stock the ledger cannot
// explain is rewritten to the ledger-derived value (counts are absolute
// anchors). Behavior-only tests through the public interface.

let n = 0
const at = (mins: number) => new Date(Date.UTC(2026, 7, 1, 0, mins)).toISOString()
const tx = (t: Partial<Transaction>): Transaction => ({
    id: `t${n++}`, type: 'PURCHASE', date: at(n), amount: 0, description: '', ...t,
} as Transaction)

const item = (id: string, stock: number, cost = 100, name = id): InventoryItem =>
    ({ id, name, stock, cost, batches: [{ id: 'b-' + id, date: at(0), cost, stock }] } as InventoryItem)

const onboarding = (stocks: Record<string, number>) => tx({
    type: 'INITIALIZATION', date: at(0),
    details: { isInitialOnboarding: true, inventoryDetails: Object.entries(stocks).map(([id, stock]) => ({ id, name: id, stock, cost: 100 })) },
})

const count = (reals: Record<string, number>, mins: number) => tx({
    type: 'ADJUSTMENT', date: at(mins),
    details: { itemsAdjusted: Object.keys(reals).length, itemDetails: Object.entries(reals).map(([id, real]) => ({ id, name: id, sys: 0, real, financialDiff: 0 })) },
})

describe('healInventoryFromLedger (authoritative)', () => {
    it('heals a clobbered count back to the counted value (2026-08-22 incident)', () => {
        // Counted down to 11.5 (tx booked), but a stale client reverted the array to 15.5.
        const txs = [onboarding({ marg: 19.5 }), count({ marg: 11.5 }, 10)]
        const { inventory, healed } = healInventoryFromLedger(txs, [item('marg', 15.5, 175, 'Margarina')])
        expect(healed).toHaveLength(1)
        expect(healed[0].valueDelta).toBe(700)
        const marg = inventory.find(i => i.id === 'marg')!
        expect(marg.stock).toBe(11.5)
        // Batches collapse to a single batch matching the healed stock.
        expect(marg.batches).toHaveLength(1)
        expect(marg.batches![0].stock).toBe(11.5)
        expect(marg.batches![0].cost).toBe(175)
    })

    it('returns the SAME array untouched when everything is consistent', () => {
        const txs = [onboarding({ a: 10 }), count({ a: 7 }, 10)]
        const inv = [item('a', 7)]
        const { inventory, healed } = healInventoryFromLedger(txs, inv)
        expect(healed).toEqual([])
        expect(inventory).toBe(inv) // no gratuitous copies — identity preserved
    })

    it('never touches items the ledger has no history for', () => {
        const txs = [onboarding({ a: 5 })]
        const manual = item('manual', 50)
        const { inventory, healed } = healInventoryFromLedger(txs, [item('a', 5), manual])
        expect(healed).toEqual([])
        expect(inventory.find(i => i.id === 'manual')).toBe(manual)
    })

    it('heals only the drifted items, leaving consistent ones intact', () => {
        const txs = [onboarding({ a: 10, b: 20 }), count({ a: 4 }, 10)]
        const okItem = item('b', 20)
        const { inventory, healed } = healInventoryFromLedger(txs, [item('a', 10), okItem])
        expect(healed.map(h => h.id)).toEqual(['a'])
        expect(inventory.find(i => i.id === 'a')!.stock).toBe(4)
        expect(inventory.find(i => i.id === 'b')).toBe(okItem)
    })
})
