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

describe('revertTransaction ADJUSTMENT (physical inventory count)', () => {
    it('restores LOST stock and keeps balance sheet tied to P&L when a count is voided', () => {
        const id = 'item-tomate'
        const txId = 'tx-count-lost'

        // Pre-count: 10 units @ ₡100 → inventario ₡1000
        useStore.setState({
            inventory: [
                { id, name: 'Tomate', cost: 100, stock: 10, batches: [{ id: 'b1', date: '2026-01-01', cost: 100, stock: 10 }] },
            ],
        })
        useStore.getState().reconcile()
        expect(useStore.getState().accounts.inventario).toBe(1000)

        // Count finds only 7 → 3 lost, drained via FIFO (cost ₡300)
        const lostCost = useStore.getState().consumeInventoryFIFO(id, 3)
        expect(lostCost).toBe(300)
        useStore.getState().reconcile()
        expect(useStore.getState().accounts.inventario).toBe(700)

        useStore.getState().addTransaction({
            id: txId,
            type: 'ADJUSTMENT',
            date: '2026-06-01',
            amount: 300,
            description: 'Toma Físico (1 items, Val: ₡300)',
            cogs: 300,
            details: {
                itemsAdjusted: 1,
                exactTotalDiff: 300,
                itemDetails: [{ id, name: 'Tomate', sys: 10, real: 7, financialDiff: 300, batchId: undefined }],
            },
        })

        // Cost recognised in P&L before the void
        expect(useStore.getState().getLedgerAccounts().costos).toBe(300)

        // Act: void the count
        useStore.getState().revertTransaction(txId)

        const item = useStore.getState().inventory.find(i => i.id === id)!
        expect(item.stock).toBe(10)                                   // stock restored
        expect(useStore.getState().accounts.inventario).toBe(1000)   // balance sheet restored
        expect(useStore.getState().getLedgerAccounts().costos).toBe(0) // P&L cost removed → stays tied
    })

    it('removes FOUND stock (the exact added batch) when a count is voided', () => {
        const id = 'item-sal'
        const txId = 'tx-count-found'
        const foundBatchId = 'batch-found'

        // Pre-count: 4 units @ ₡50 → inventario ₡200
        useStore.setState({
            inventory: [
                { id, name: 'Sal', cost: 50, stock: 4, batches: [{ id: 'b1', date: '2026-01-01', cost: 50, stock: 4 }] },
            ],
        })
        useStore.getState().reconcile()
        expect(useStore.getState().accounts.inventario).toBe(200)

        // Count finds 6 → 2 extra added as a new batch at avg cost ₡50
        useStore.setState({
            inventory: useStore.getState().inventory.map(i =>
                i.id === id
                    ? { ...i, stock: 6, batches: [...i.batches!, { id: foundBatchId, date: '2026-06-01', cost: 50, stock: 2 }] }
                    : i
            ),
        })
        useStore.getState().reconcile()
        expect(useStore.getState().accounts.inventario).toBe(300)

        useStore.getState().addTransaction({
            id: txId,
            type: 'ADJUSTMENT',
            date: '2026-06-01',
            amount: 100,
            description: 'Toma Físico (1 items, Val: -₡100)',
            cogs: -100, // found stock → negative cost (gain)
            details: {
                itemsAdjusted: 1,
                exactTotalDiff: -100,
                itemDetails: [{ id, name: 'Sal', sys: 4, real: 6, financialDiff: -100, batchId: foundBatchId }],
            },
        })

        // Gain reduces P&L cost before the void
        expect(useStore.getState().getLedgerAccounts().costos).toBe(-100)

        // Act: void the count
        useStore.getState().revertTransaction(txId)

        const item = useStore.getState().inventory.find(i => i.id === id)!
        expect(item.stock).toBe(4)                                    // found stock removed
        expect(item.batches!.some(b => b.id === foundBatchId)).toBe(false) // exact batch gone
        expect(useStore.getState().accounts.inventario).toBe(200)     // balance sheet restored
        expect(useStore.getState().getLedgerAccounts().costos).toBe(0) // P&L gain removed → stays tied
    })
})
