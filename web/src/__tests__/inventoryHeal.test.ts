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

    it('drains LIFO on reduction, preserving historical costs (2026-09-30 paletas incident)', () => {
        // Old layer: 100 units @ ₡5 (onboarding). New layer: 100 units @ ₡950
        // (a typo purchase, later voided — but a racing window's array kept it).
        // Ledger says 100. LIFO must remove the NEW poisoned layer and leave the
        // old ₡5 stock untouched — the old collapse-at-average froze ₡477.50.
        const paletas = {
            id: 'pal', name: 'Paletas', stock: 200, cost: 477.5,
            batches: [
                { id: 'onb', date: at(0), cost: 5, stock: 100 },
                { id: 'typo', date: at(50), cost: 950, stock: 100 },
            ],
        } as InventoryItem
        const txs = [onboarding({ pal: 100 })]
        const { inventory, healed } = healInventoryFromLedger(txs, [paletas])
        expect(healed).toHaveLength(1)
        const p = inventory.find(i => i.id === 'pal')!
        expect(p.stock).toBe(100)
        expect(p.cost).toBe(5) // historical cost preserved — zero phantom value
        expect(p.batches).toHaveLength(1)
        expect(p.batches![0].id).toBe('onb')
        expect(p.batches![0].cost).toBe(5)
    })

    it('partial LIFO drain trims the newest batch and keeps the rest', () => {
        const it2 = {
            id: 'x', name: 'X', stock: 10, cost: 28,
            batches: [
                { id: 'old', date: at(0), cost: 10, stock: 5 },
                { id: 'new', date: at(50), cost: 46, stock: 5 },
            ],
        } as InventoryItem
        const txs = [onboarding({ x: 7 })] // expected 7 → drain 3 from 'new'
        const { inventory } = healInventoryFromLedger(txs, [it2])
        const x = inventory.find(i => i.id === 'x')!
        expect(x.stock).toBe(7)
        expect(x.batches!.map(b => [b.id, b.stock])).toEqual([['old', 5], ['new', 2]])
        expect(x.cost).toBeCloseTo((5 * 10 + 2 * 46) / 7, 10)
    })

    it('adds found stock at the current average cost on increase', () => {
        const txs = [onboarding({ a: 10 })]
        const { inventory } = healInventoryFromLedger(txs, [item('a', 6, 100)])
        const a = inventory.find(i => i.id === 'a')!
        expect(a.stock).toBe(10)
        expect(a.cost).toBe(100)
        expect(a.batches!.some(b => b.id.startsWith('heal-') && b.stock === 4 && b.cost === 100)).toBe(true)
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
