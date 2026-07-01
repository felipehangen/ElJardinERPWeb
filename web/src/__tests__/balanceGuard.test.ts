import { describe, it, expect } from 'vitest'
import { computeDiferencia, DIFERENCIA_TOLERANCE, type BalanceState } from '../lib/balanceGuard'
import type { Transaction, Accounts } from '../types'

// The guard's whole job is to report the "Diferencia por Conciliar": the gap
// between derived equity (patrimonio) and capital + accumulated P&L. These tests
// assert observable behavior through computeDiferencia's public interface only.

const acct = (over: Partial<Accounts> = {}): Accounts => ({
    banco: 0, caja_chica: 0, inventario: 0, activo_fijo: 0, patrimonio: 0, ...over,
} as Accounts)

const tx = (t: Partial<Transaction>): Transaction => ({
    id: Math.random().toString(36).slice(2),
    type: 'SALE', date: '2026-06-01T00:00:00Z', amount: 0, description: '', ...t,
} as Transaction)

describe('computeDiferencia — save-time balance guard', () => {
    it('is zero when patrimonio equals capital plus retained earnings', () => {
        // Capital 100k in; a 1,000 cash sale (COGS recognised later) grows equity to 101k.
        const state: BalanceState = {
            transactions: [
                tx({ type: 'INITIALIZATION', amount: 100000 }),
                tx({ type: 'SALE', amount: 1000, cogs: 0 }),
            ],
            accounts: acct({ patrimonio: 101000 }),
        }
        expect(computeDiferencia(state)).toBe(0)
    })

    it('flags a positive gap when patrimonio exceeds what the ledger explains', () => {
        // Same ledger, but patrimonio is inflated by 5,000 (e.g. a stale inventory
        // array that reverted a physical count while its COGS stayed booked).
        const state: BalanceState = {
            transactions: [
                tx({ type: 'INITIALIZATION', amount: 100000 }),
                tx({ type: 'SALE', amount: 1000, cogs: 0 }),
            ],
            accounts: acct({ patrimonio: 106000 }),
        }
        expect(computeDiferencia(state)).toBe(5000)
    })

    it('counts inventory physical-count ADJUSTMENTs as COGS', () => {
        // Capital 100k; a count books 800 COGS, so equity should fall to 99,200.
        const balanced: BalanceState = {
            transactions: [
                tx({ type: 'INITIALIZATION', amount: 100000 }),
                tx({ type: 'ADJUSTMENT', amount: 800, cogs: 800, details: { itemsAdjusted: 3 } }),
            ],
            accounts: acct({ patrimonio: 99200 }),
        }
        expect(computeDiferencia(balanced)).toBe(0)
    })

    it('ignores VOIDED transactions', () => {
        const state: BalanceState = {
            transactions: [
                tx({ type: 'INITIALIZATION', amount: 100000 }),
                tx({ type: 'SALE', amount: 5000, cogs: 0, status: 'VOIDED' }),
            ],
            accounts: acct({ patrimonio: 100000 }),
        }
        expect(computeDiferencia(state)).toBe(0)
    })

    it('exposes a tolerance for rounding noise', () => {
        expect(DIFERENCIA_TOLERANCE).toBeGreaterThan(0)
    })
})
