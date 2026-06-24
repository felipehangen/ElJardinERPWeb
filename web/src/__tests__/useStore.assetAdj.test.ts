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

describe('getLedgerAccounts — asset count adjustment classification', () => {
    it('Test A: asset count loss (assetDiff > 0) goes to otrosGastos', () => {
        // diff = 1000 means system valued assets at 1000 MORE than real → loss
        useStore.getState().addTransaction({
            id: 'tx-asset-loss',
            type: 'ADJUSTMENT',
            date: new Date().toISOString(),
            amount: 1000,
            description: 'Ajuste de Activos (Dif: -₡1,000)',
            // cogs is undefined — should use details.assetDiff
            details: { diff: 1000, assetDiff: 1000 },
        })

        const result = useStore.getState().getLedgerAccounts()

        // assetDiff > 0 → loss → otrosGastos
        expect(result.otrosGastos).toBe(1000)
        expect(result.otrosIngresos).toBe(0)
    })

    it('Test B: asset count gain (assetDiff < 0) goes to otrosIngresos', () => {
        // diff = -500 means real assets are worth 500 MORE than system → gain
        useStore.getState().addTransaction({
            id: 'tx-asset-gain',
            type: 'ADJUSTMENT',
            date: new Date().toISOString(),
            amount: 500,
            description: 'Ajuste de Activos (Dif: +₡500)',
            // cogs is undefined — should use details.assetDiff
            details: { diff: -500, assetDiff: -500 },
        })

        const result = useStore.getState().getLedgerAccounts()

        // assetDiff < 0 → gain → otrosIngresos
        expect(result.otrosIngresos).toBe(500)
        expect(result.otrosGastos).toBe(0)
    })
})
