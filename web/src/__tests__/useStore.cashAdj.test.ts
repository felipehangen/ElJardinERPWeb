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

describe('getLedgerAccounts — cash adjustment classification', () => {
    it('Test A: transaction with description containing "+" but positive diff is classified as loss', () => {
        // diffCaja = 50 means system had 50 MORE than real → cash LOSS → otrosGastos
        useStore.getState().addTransaction({
            id: 'tx-adj-a',
            type: 'ADJUSTMENT',
            date: new Date().toISOString(),
            amount: 50,
            description: 'Ajuste + sobrante',
            details: {
                method: 'caja_chica',
                account: 'caja_chica',
                diffCaja: 50,    // positive = loss
                sysVal: 1050,
                realVal: 1000,
            },
        })

        const result = useStore.getState().getLedgerAccounts()

        // diff is 50 (positive) → loss → goes to otrosGastos
        expect(result.otrosGastos).toBe(50)
        // Must NOT be classified as income despite "+" in description
        expect(result.otrosIngresos).toBe(0)
    })

    it('Test B: transaction with no diff fields and "+" description is NOT classified as income', () => {
        // Legacy transaction: no diffCaja / diffBanco, description contains "+"
        // Old code would treat this as income. New code must skip it entirely.
        useStore.getState().addTransaction({
            id: 'tx-adj-b',
            type: 'ADJUSTMENT',
            date: new Date().toISOString(),
            amount: 100,
            description: 'Ajuste de caja + encontrado',
            details: {
                method: 'caja_chica',
                // intentionally omitting diffCaja and diffBanco
            },
        })

        const result = useStore.getState().getLedgerAccounts()

        // Transaction must be skipped — no income, no expense
        expect(result.otrosIngresos).toBe(0)
        expect(result.otrosGastos).toBe(0)
    })
})
