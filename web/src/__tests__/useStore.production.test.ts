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

describe('revertTransaction PRODUCTION', () => {
    it('restores ingredient stock priced at ingredient cost, not at a fraction of tx.amount', () => {
        const harinaId = 'item-harina'
        const batchId = 'batch-harina-1'

        // Setup: Harina with cost 200, stock 10, one batch
        useStore.setState({
            inventory: [
                {
                    id: harinaId,
                    name: 'Harina',
                    cost: 200,
                    stock: 10,
                    batches: [{ id: batchId, date: '2026-01-01', cost: 200, stock: 10 }],
                },
            ],
        })

        const productionTxId = 'tx-prod-1'

        // Add a PRODUCTION transaction:
        //   tx.amount = 5000 (high revenue — intentionally much larger than ingredient cost)
        //   used 2 units of Harina (cost 200 each → true ingredient cost = 400)
        useStore.getState().addTransaction({
            id: productionTxId,
            date: '2026-06-01',
            type: 'PRODUCTION',
            amount: 5000,
            description: 'Produccion test',
            details: {
                outputName: 'Producto terminado',
                outputQty: 1,
                ingredients: [
                    { item: { id: harinaId, name: 'Harina', cost: 200 }, qty: '2' },
                ],
            },
        })

        // Simulate deducting ingredient stock (as recordProduction would do)
        useStore.setState({
            inventory: useStore.getState().inventory.map(i => {
                if (i.id !== harinaId) return i
                return {
                    ...i,
                    stock: 8,
                    batches: [{ ...i.batches![0], stock: 8 }],
                }
            }),
        })

        // Act: revert the production transaction
        useStore.getState().revertTransaction(productionTxId)

        const updatedInventory = useStore.getState().inventory
        const harina = updatedInventory.find(i => i.id === harinaId)!

        // Stock must be restored to 10
        expect(harina.stock).toBe(10)

        // The refund batch (last batch after sort) should be priced at 200/unit, NOT 5000 * proportion
        const refundBatch = harina.batches![harina.batches!.length - 1]
        expect(refundBatch.stock).toBe(2)

        // With the buggy code: proportion = (2 * 200) / 400 = 1.0, cost = 5000 * 1.0 / 2 = 2500 per unit
        // With the fix:       exactCost = 2 * 200 = 400,           cost = 400 / 2 = 200 per unit
        expect(refundBatch.cost).toBe(200)
    })
})
