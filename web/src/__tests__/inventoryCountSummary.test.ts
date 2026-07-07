import { describe, it, expect } from 'vitest'
import { summarizeInventoryCount } from '../lib/inventoryCountSummary'
import type { InventoryItem } from '../types'

// Pre-confirmation summary for the physical count modal. Behavior-only tests
// through the public interface; values estimated at weighted-average cost.

const item = (id: string, stock: number, cost = 100, name = id): InventoryItem =>
    ({ id, name, stock, cost } as InventoryItem)

describe('summarizeInventoryCount', () => {
    it('reports nothing when no counts were entered', () => {
        const s = summarizeInventoryCount({}, [item('a', 10)])
        expect(s.itemsAdjusted).toBe(0)
        expect(s.items).toEqual([])
        expect(s.totalValueDiff).toBe(0)
        expect(s.isLoss).toBe(false)
    })

    it('excludes counts that match the system stock', () => {
        const s = summarizeInventoryCount({ a: '10' }, [item('a', 10)])
        expect(s.itemsAdjusted).toBe(0)
    })

    it('flags a faltante as a negative diff and a loss', () => {
        const s = summarizeInventoryCount({ pan: '6' }, [item('pan', 14, 1000, 'Bolsa pan casero')])
        expect(s.itemsAdjusted).toBe(1)
        expect(s.items[0]).toEqual({
            id: 'pan', name: 'Bolsa pan casero', sys: 14, real: 6,
            qtyDiff: -8, valueDiff: -8000,
        })
        expect(s.totalValueDiff).toBe(-8000)
        expect(s.isLoss).toBe(true)
    })

    it('flags a sobrante as a positive diff and a gain', () => {
        const s = summarizeInventoryCount({ a: '12' }, [item('a', 10, 50)])
        expect(s.items[0].qtyDiff).toBe(2)
        expect(s.items[0].valueDiff).toBe(100)
        expect(s.isLoss).toBe(false)
    })

    it('nets sobrantes against faltantes in the total', () => {
        const s = summarizeInventoryCount(
            { a: '8', b: '5' },
            [item('a', 10, 100), item('b', 4, 300)], // -200 + 300
        )
        expect(s.itemsAdjusted).toBe(2)
        expect(s.totalValueDiff).toBe(100)
        expect(s.isLoss).toBe(false)
    })

    it('treats a blank entry as a count of zero (full faltante)', () => {
        const s = summarizeInventoryCount({ a: '' }, [item('a', 3, 100)])
        expect(s.items[0].real).toBe(0)
        expect(s.totalValueDiff).toBe(-300)
    })

    it('ignores ids missing from the inventory and non-numeric entries', () => {
        const s = summarizeInventoryCount({ ghost: '5', a: 'abc' }, [item('a', 3)])
        expect(s.itemsAdjusted).toBe(0)
    })
})
