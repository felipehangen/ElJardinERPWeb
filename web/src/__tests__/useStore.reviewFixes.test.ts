import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from '../store/useStore'
import { INITIAL_STATE } from '../types'

vi.mock('../store/cloudStorage', () => ({
    cloudStorage: {
        getItem: vi.fn(async () => null),
        setItem: vi.fn(async () => {}),
        removeItem: vi.fn(async () => {}),
    },
    CLOUD_STORAGE_KEY: 'jardin-erp-storage-v4',
}))

beforeEach(() => {
    useStore.setState(INITIAL_STATE)
})

describe('#2 revertTransaction PRODUCTION uses exact FIFO cost (not average)', () => {
    it('restores the refund batch at the recorded exact cost when avg != FIFO', () => {
        const id = 'm'
        // Two batches at different costs → avg 150, but FIFO consumes the ₡100 batch first.
        // Post-production state: 5 units already drained from the ₡100 batch.
        useStore.setState({
            inventory: [{
                id, name: 'Masa', cost: 166.6667, stock: 15,
                batches: [
                    { id: 'b-old', date: '2026-01-01', cost: 100, stock: 5 },
                    { id: 'b-new', date: '2026-02-01', cost: 200, stock: 10 },
                ],
            }],
        })

        const txId = 'tx-prod-exact'
        useStore.getState().addTransaction({
            id: txId, type: 'PRODUCTION', date: '2026-03-01', amount: 500,
            description: 'Cocina exact-cost',
            details: {
                // No outputName → reversal only restores ingredients
                outputQty: 1,
                ingredients: [
                    { item: { id, name: 'Masa', cost: 150 }, qty: '5', exactCost: 500 }, // FIFO drained 5 @ ₡100
                ],
            },
        })

        useStore.getState().revertTransaction(txId)

        const item = useStore.getState().inventory.find(i => i.id === id)!
        const refund = item.batches!.find(b => b.id.startsWith('refund-'))!
        // exactCost 500 / 5 = ₡100 per unit. Old (avg) code would have used 150.
        expect(refund.cost).toBe(100)
        expect(refund.stock).toBe(5)
        expect(item.stock).toBe(20) // 15 restored back to 20
    })
})

describe('#4 getLedgerAccounts classifies each cash account by its own diff', () => {
    it('a single tx carrying both diffCaja (loss) and diffBanco (gain) splits correctly', () => {
        useStore.getState().addTransaction({
            id: 'tx-combined', type: 'ADJUSTMENT', date: new Date().toISOString(),
            amount: 140, description: 'Ajuste combinado',
            details: { method: 'caja_chica', diffCaja: 100, diffBanco: -40 },
        })

        const r = useStore.getState().getLedgerAccounts()
        expect(r.otrosGastos).toBe(100)   // caja loss
        expect(r.otrosIngresos).toBe(40)  // banco gain
    })
})

describe('#5 simulateInventoryFIFO normalizes phantom stock (matches consume)', () => {
    it('values phantom stock so the preview equals the real consumption cost', () => {
        const id = 'p'
        useStore.setState({
            inventory: [{
                id, name: 'Phantom', cost: 100, stock: 10,
                batches: [{ id: 'b1', date: '2026-01-01', cost: 100, stock: 6 }], // only 6 of 10 backed
            }],
        })

        // Preview first (no mutation): 6@100 + 4 phantom@100 = 1000 (was 600 before the fix)
        const simulated = useStore.getState().simulateInventoryFIFO(id, 10)
        expect(simulated).toBe(1000)

        // Real consumption returns the same total → parity
        const consumed = useStore.getState().consumeInventoryFIFO(id, 10)
        expect(consumed).toBe(simulated)
    })
})
