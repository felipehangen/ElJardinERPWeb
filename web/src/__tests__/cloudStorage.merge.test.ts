import { describe, it, expect } from 'vitest'
import { mergeTransactionLogs } from '../store/cloudStorage'

const blob = (txs: any[], extra: Record<string, any> = {}) => ({
    _savedAt: '2026-06-25T00:00:00.000Z',
    state: { accounts: { banco: 0 }, transactions: txs, ...extra },
})
const ids = (b: any) => b.state.transactions.map((t: any) => t.id).sort()

describe('mergeTransactionLogs — union transaction logs by id', () => {
    it('unions transactions present on only one side (no entry is lost)', () => {
        const base = blob([{ id: 'a', date: '2026-06-01T00:00:00Z' }])
        const other = blob([{ id: 'b', date: '2026-06-02T00:00:00Z' }])
        expect(ids(mergeTransactionLogs(base, other))).toEqual(['a', 'b'])
    })

    it('dedupes ids present on both sides', () => {
        const base = blob([{ id: 'a', date: '2026-06-01T00:00:00Z' }])
        const other = blob([{ id: 'a', date: '2026-06-01T00:00:00Z' }, { id: 'b', date: '2026-06-02T00:00:00Z' }])
        const m = mergeTransactionLogs(base, other)
        expect(ids(m)).toEqual(['a', 'b'])
        expect(m.state.transactions.filter((t: any) => t.id === 'a')).toHaveLength(1)
    })

    it('prefers the VOIDED version when one side has voided a shared transaction', () => {
        const base = blob([{ id: 'a', date: '2026-06-01T00:00:00Z' }]) // active
        const other = blob([{ id: 'a', date: '2026-06-01T00:00:00Z', status: 'VOIDED', voidingTxId: 'c' }])
        const a = mergeTransactionLogs(base, other).state.transactions.find((t: any) => t.id === 'a')
        expect(a.status).toBe('VOIDED')
    })

    it('keeps the voided version even when it is the base (does not regress to active)', () => {
        const base = blob([{ id: 'a', date: '2026-06-01T00:00:00Z', status: 'VOIDED', voidingTxId: 'c' }])
        const other = blob([{ id: 'a', date: '2026-06-01T00:00:00Z' }]) // active (stale)
        const a = mergeTransactionLogs(base, other).state.transactions.find((t: any) => t.id === 'a')
        expect(a.status).toBe('VOIDED')
    })

    it('keeps base non-transaction state (accounts/catalogs)', () => {
        const base = blob([{ id: 'a', date: '2026-06-01T00:00:00Z' }], { accounts: { banco: 999 } })
        const other = blob([{ id: 'b', date: '2026-06-02T00:00:00Z' }], { accounts: { banco: 111 } })
        expect(mergeTransactionLogs(base, other).state.accounts.banco).toBe(999)
    })

    it('returns merged log newest-first by date', () => {
        const base = blob([{ id: 'old', date: '2026-06-01T00:00:00Z' }])
        const other = blob([{ id: 'new', date: '2026-06-09T00:00:00Z' }])
        expect(ids(mergeTransactionLogs(base, other))).toEqual(['new', 'old'].sort())
        expect(mergeTransactionLogs(base, other).state.transactions[0].id).toBe('new')
    })

    it('is safe when a side has no transactions array', () => {
        const base = blob([{ id: 'a', date: '2026-06-01T00:00:00Z' }])
        const broken = { _savedAt: 'x', state: {} }
        expect(mergeTransactionLogs(base, broken)).toBe(base)
    })
})
