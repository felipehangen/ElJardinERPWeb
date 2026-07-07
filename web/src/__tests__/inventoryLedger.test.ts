import { describe, it, expect } from 'vitest'
import { auditInventoryAgainstLedger, totalDriftValue } from '../lib/inventoryLedger'
import type { Transaction, InventoryItem } from '../types'

// Shadow audit: expected stock = latest count anchor + purchases − production
// use + production output. Behavior-only tests through the public interface.

let n = 0
const at = (mins: number) => new Date(Date.UTC(2026, 6, 1, 0, mins)).toISOString()
const tx = (t: Partial<Transaction>): Transaction => ({
    id: `t${n++}`, type: 'PURCHASE', date: at(n), amount: 0, description: '', ...t,
} as Transaction)

const item = (id: string, stock: number, cost = 100, name = id): InventoryItem =>
    ({ id, name, stock, cost } as InventoryItem)

const onboarding = (stocks: Record<string, number>) => tx({
    type: 'INITIALIZATION', date: at(0),
    details: { isInitialOnboarding: true, inventoryDetails: Object.entries(stocks).map(([id, stock]) => ({ id, name: id, stock, cost: 100 })) },
})

const purchase = (id: string, qty: number, mins: number) => tx({
    type: 'PURCHASE', date: at(mins), details: { type: 'inventory', itemId: id, quantity: qty, method: 'caja_chica' },
})

const count = (reals: Record<string, number>, mins: number) => tx({
    type: 'ADJUSTMENT', date: at(mins),
    details: { itemsAdjusted: Object.keys(reals).length, itemDetails: Object.entries(reals).map(([id, real]) => ({ id, name: id, sys: 0, real, financialDiff: 0 })) },
})

describe('auditInventoryAgainstLedger (shadow)', () => {
    it('is quiet when the array matches the ledger replay', () => {
        const txs = [onboarding({ a: 10 }), purchase('a', 5, 10), count({ a: 12 }, 20), purchase('a', 3, 30)]
        expect(auditInventoryAgainstLedger(txs, [item('a', 15)])).toEqual([])
    })

    it('detects a reverted count (2026-06-30 incident): array back at pre-count stock', () => {
        // Counted down to 6, but a stale window's array (14) won the merge.
        const txs = [onboarding({ pan: 14 }), count({ pan: 6 }, 10)]
        const drifts = auditInventoryAgainstLedger(txs, [item('pan', 14, 1000, 'Bolsa pan casero')])
        expect(drifts).toHaveLength(1)
        expect(drifts[0].expectedStock).toBe(6)
        expect(drifts[0].valueDelta).toBe(8000) // phantom stock
        expect(totalDriftValue(drifts)).toBe(8000)
    })

    it('detects a lost purchase: tx booked but array effect missing', () => {
        const txs = [onboarding({ a: 2 }), purchase('a', 4, 10)]
        const drifts = auditInventoryAgainstLedger(txs, [item('a', 2)])
        expect(drifts).toHaveLength(1)
        expect(drifts[0].expectedStock).toBe(6)
        expect(drifts[0].valueDelta).toBe(-400)
    })

    it('the latest count re-anchors: earlier history cannot alarm', () => {
        // Messy early history, then a count SETs the truth.
        const txs = [onboarding({ a: 99 }), purchase('a', 7, 5), count({ a: 3 }, 10)]
        expect(auditInventoryAgainstLedger(txs, [item('a', 3)])).toEqual([])
    })

    it('skips VOIDED transactions and their contras', () => {
        const voided = { ...purchase('a', 5, 10), status: 'VOIDED' as const }
        const contra = tx({ type: 'ADJUSTMENT', date: at(11), voidingTxId: voided.id, details: null })
        const txs = [onboarding({ a: 2 }), voided, contra]
        expect(auditInventoryAgainstLedger(txs, [item('a', 2)])).toEqual([])
    })

    it('replays production: ingredients out, output in', () => {
        const prod = tx({
            type: 'PRODUCTION', date: at(10),
            details: { outputId: 'pan', outputQty: 8, ingredients: [{ item: { id: 'harina' }, qty: '2' }] },
        })
        const txs = [onboarding({ harina: 5 }), prod]
        expect(auditInventoryAgainstLedger(txs, [item('harina', 3), item('pan', 8)])).toEqual([])
    })

    it('ignores array items the ledger has never referenced', () => {
        const txs = [onboarding({ a: 1 })]
        expect(auditInventoryAgainstLedger(txs, [item('a', 1), item('manual', 50)])).toEqual([])
    })

    it('ignores sub-tolerance rounding noise', () => {
        const txs = [onboarding({ a: 10 })]
        const drifts = auditInventoryAgainstLedger(txs, [item('a', 10.001, 100)])
        expect(drifts).toEqual([])
    })

    it('tolerates the legacy correctivo whose itemsAdjusted is an object without itemDetails', () => {
        const correctivo = tx({
            type: 'ADJUSTMENT', date: at(10), cogs: 29045.31,
            details: { isCorrectivo: true, isReconciliation: true, itemsAdjusted: {} },
        })
        const txs = [onboarding({ a: 4 }), correctivo]
        expect(auditInventoryAgainstLedger(txs, [item('a', 4)])).toEqual([])
    })
})
