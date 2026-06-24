import { describe, it, expect } from 'vitest'
import { classifyAdjustmentForChart } from '../components/Analysis'
import type { Transaction } from '../types'

// Helper to build a minimal ADJUSTMENT transaction
function makeAdj(overrides: Partial<Transaction>): Transaction {
    return {
        id: 'tx-test',
        type: 'ADJUSTMENT',
        date: new Date().toISOString(),
        amount: 0,
        description: 'Test adjustment',
        ...overrides,
    }
}

describe('classifyAdjustmentForChart — ADJUSTMENT classification', () => {
    it('1. Asset count loss (details.diff > 0, no itemsAdjusted) → asGasto, asCosto = 0', () => {
        const tx = makeAdj({
            amount: 1000,
            details: { diff: 1000, assetDiff: 1000 },
            // no itemsAdjusted
        })
        const result = classifyAdjustmentForChart(tx)
        expect(result.asGasto).toBe(1000)
        expect(result.asCosto).toBe(0)
        expect(result.asIngreso).toBe(0)
        expect(result.isRelevant).toBe(true)
    })

    it('2. Asset count gain (details.diff < 0, no itemsAdjusted) → asIngreso, asGasto = 0, asCosto = 0', () => {
        const tx = makeAdj({
            amount: 500,
            details: { diff: -500, assetDiff: -500 },
            // no itemsAdjusted
        })
        const result = classifyAdjustmentForChart(tx)
        expect(result.asIngreso).toBe(500)
        expect(result.asGasto).toBe(0)
        expect(result.asCosto).toBe(0)
        expect(result.isRelevant).toBe(true)
    })

    it('3. Inventory physical count (details.itemsAdjusted defined, cogs: 2000) → asCosto = 2000, asGasto = 0', () => {
        const tx = makeAdj({
            amount: 2000,
            cogs: 2000,
            details: {
                itemsAdjusted: 5,
                exactTotalDiff: 2000,
                counts: {},
                itemDetails: [],
            },
        })
        const result = classifyAdjustmentForChart(tx)
        expect(result.asCosto).toBe(2000)
        expect(result.asGasto).toBe(0)
        expect(result.asIngreso).toBe(0)
        expect(result.isRelevant).toBe(true)
    })

    it('4. Cash adjustment loss (details.method: caja_chica, diffCaja: 100) → asGasto = 100, asCosto = 0', () => {
        const tx = makeAdj({
            amount: 100,
            details: {
                method: 'caja_chica',
                diffCaja: 100, // positive = loss
            },
        })
        const result = classifyAdjustmentForChart(tx)
        expect(result.asGasto).toBe(100)
        expect(result.asCosto).toBe(0)
        expect(result.asIngreso).toBe(0)
        expect(result.isRelevant).toBe(true)
    })

    it('5. Cash adjustment gain (details.method: banco, diffBanco: -200) → asIngreso, asGasto = 0, asCosto = 0', () => {
        const tx = makeAdj({
            amount: 200,
            details: {
                method: 'banco',
                diffBanco: -200, // negative = gain
            },
        })
        const result = classifyAdjustmentForChart(tx)
        expect(result.asIngreso).toBe(200)
        expect(result.asGasto).toBe(0)
        expect(result.asCosto).toBe(0)
        expect(result.isRelevant).toBe(true)
    })
})
