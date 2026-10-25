import { describe, it, expect } from 'vitest'
import {
    lastCashAuditFor,
    isBackdatedBehindAudit,
    accountsAnchoredAfter,
    lastInventoryCountFor,
    itemsAnchoredAfter,
    buildBackdatedTimestamp,
} from '../lib/backdateGuard'
import type { Transaction } from '../types'

// A cash audit (ADJUSTMENT with details.realVal) SETs the account when the
// ledger replays chronologically, so any transaction dated before it cannot
// move derived cash — it opens "Diferencia por Conciliar" instead. These tests
// pin the predicate that decides when to warn the user about that.

const tx = (t: Partial<Transaction>): Transaction => ({
    id: Math.random().toString(36).slice(2),
    type: 'SALE', date: '2026-06-01T00:00:00Z', amount: 0, description: '', ...t,
} as Transaction)

const audit = (date: string, method: 'caja_chica' | 'banco', over: Partial<Transaction> = {}): Transaction =>
    tx({ type: 'ADJUSTMENT', date, details: { method, realVal: 1000, sysVal: 900 }, ...over })

describe('lastCashAuditFor', () => {
    it('returns null when the account was never audited', () => {
        expect(lastCashAuditFor([tx({ type: 'SALE' })], 'caja_chica')).toBeNull()
    })

    it('finds the latest audit for the account regardless of array order', () => {
        const older = audit('2026-09-01T18:00:00Z', 'caja_chica')
        const newer = audit('2026-10-01T18:00:00Z', 'caja_chica')
        expect(lastCashAuditFor([older, newer], 'caja_chica')?.id).toBe(newer.id)
        expect(lastCashAuditFor([newer, older], 'caja_chica')?.id).toBe(newer.id)
    })

    it('only matches the requested account', () => {
        const banco = audit('2026-10-01T18:00:00Z', 'banco')
        expect(lastCashAuditFor([banco], 'caja_chica')).toBeNull()
        expect(lastCashAuditFor([banco], 'banco')?.id).toBe(banco.id)
    })

    it('accepts the legacy details.account alias', () => {
        const legacy = tx({ type: 'ADJUSTMENT', date: '2026-10-01T18:00:00Z', details: { account: 'banco', realVal: 500 } })
        expect(lastCashAuditFor([legacy], 'banco')?.id).toBe(legacy.id)
    })

    it('ignores VOIDED audits and [ANULACIÓN] contra-transactions', () => {
        const voided = audit('2026-10-01T18:00:00Z', 'caja_chica', { status: 'VOIDED' })
        const contra = audit('2026-10-02T18:00:00Z', 'caja_chica', { voidingTxId: 'orig-id' })
        expect(lastCashAuditFor([voided, contra], 'caja_chica')).toBeNull()
    })

    it('ignores ADJUSTMENTs without realVal (correctivo deltas, inventory counts)', () => {
        const delta = tx({ type: 'ADJUSTMENT', date: '2026-10-01T18:00:00Z', details: { method: 'caja_chica', diffCaja: 200 } })
        const invCount = tx({ type: 'ADJUSTMENT', date: '2026-10-01T18:00:00Z', details: { itemsAdjusted: 3, counts: {} } })
        expect(lastCashAuditFor([delta, invCount], 'caja_chica')).toBeNull()
    })
})

describe('isBackdatedBehindAudit', () => {
    const ledger = [audit('2026-10-01T18:00:00Z', 'caja_chica')]

    it('is false when the account was never audited', () => {
        expect(isBackdatedBehindAudit([], 'caja_chica', '2026-09-15T12:00:00Z')).toBe(false)
    })

    it('is true for a date before the latest audit', () => {
        expect(isBackdatedBehindAudit(ledger, 'caja_chica', '2026-09-30T12:00:00Z')).toBe(true)
    })

    it('is false for a date after the latest audit', () => {
        expect(isBackdatedBehindAudit(ledger, 'caja_chica', '2026-10-02T12:00:00Z')).toBe(false)
    })

    it('compares full timestamps: same day but earlier hour is still behind', () => {
        expect(isBackdatedBehindAudit(ledger, 'caja_chica', '2026-10-01T12:00:00Z')).toBe(true)
        expect(isBackdatedBehindAudit(ledger, 'caja_chica', '2026-10-01T19:00:00Z')).toBe(false)
    })

    it('only the audited account warns', () => {
        expect(isBackdatedBehindAudit(ledger, 'banco', '2026-09-30T12:00:00Z')).toBe(false)
    })

    it('uses the LATEST audit: a date between two audits is only behind the second', () => {
        const two = [audit('2026-09-01T18:00:00Z', 'caja_chica'), audit('2026-10-01T18:00:00Z', 'caja_chica')]
        expect(isBackdatedBehindAudit(two, 'caja_chica', '2026-09-15T12:00:00Z')).toBe(true)
    })
})

describe('accountsAnchoredAfter', () => {
    const ledger = [
        audit('2026-10-01T18:00:00Z', 'caja_chica'),
        audit('2026-08-01T18:00:00Z', 'banco'),
    ]

    it('returns only the accounts whose audit postdates the tx date', () => {
        expect(accountsAnchoredAfter(ledger, ['caja_chica', 'banco'], '2026-09-15T12:00:00Z')).toEqual(['caja_chica'])
    })

    it('returns both for a split sale behind both audits', () => {
        expect(accountsAnchoredAfter(ledger, ['caja_chica', 'banco'], '2026-07-15T12:00:00Z')).toEqual(['caja_chica', 'banco'])
    })

    it('deduplicates accounts from multiple queued sales', () => {
        expect(accountsAnchoredAfter(ledger, ['caja_chica', 'caja_chica', 'caja_chica'], '2026-09-15T12:00:00Z')).toEqual(['caja_chica'])
    })

    it('is empty when nothing is anchored after the date', () => {
        expect(accountsAnchoredAfter(ledger, ['caja_chica', 'banco'], '2026-10-02T12:00:00Z')).toEqual([])
    })
})

// A physical count (ADJUSTMENT with itemDetails[].real) SETs the item's stock on
// ledger replay, so a PURCHASE dated before it adds stock the replay cannot
// explain — healInventoryFromLedger strips it at the next rehydrate.
const count = (date: string, itemIds: string[], over: Partial<Transaction> = {}): Transaction =>
    tx({
        type: 'ADJUSTMENT', date,
        details: {
            itemsAdjusted: itemIds.length, exactTotalDiff: 0, counts: {},
            itemDetails: itemIds.map(id => ({ id, name: id, sys: 1, real: 2, financialDiff: 0 })),
        },
        ...over,
    })

describe('lastInventoryCountFor', () => {
    it('returns null when the item was never counted', () => {
        expect(lastInventoryCountFor([count('2026-10-01T18:00:00Z', ['other'])], 'arroz')).toBeNull()
    })

    it('finds the latest count covering the item regardless of array order', () => {
        const older = count('2026-09-01T18:00:00Z', ['arroz'])
        const newer = count('2026-10-01T18:00:00Z', ['arroz', 'frijoles'])
        expect(lastInventoryCountFor([newer, older], 'arroz')?.id).toBe(newer.id)
        expect(lastInventoryCountFor([older, newer], 'arroz')?.id).toBe(newer.id)
    })

    it('ignores VOIDED counts and contra-transactions', () => {
        const voided = count('2026-10-01T18:00:00Z', ['arroz'], { status: 'VOIDED' })
        const contra = count('2026-10-02T18:00:00Z', ['arroz'], { voidingTxId: 'orig' })
        expect(lastInventoryCountFor([voided, contra], 'arroz')).toBeNull()
    })

    it('ignores cash audits and other ADJUSTMENTs', () => {
        expect(lastInventoryCountFor([audit('2026-10-01T18:00:00Z', 'caja_chica')], 'arroz')).toBeNull()
    })
})

describe('itemsAnchoredAfter', () => {
    const ledger = [count('2026-10-01T18:00:00Z', ['arroz'])]

    it('returns only items whose count postdates the tx date, with the count date', () => {
        const anchored = itemsAnchoredAfter(ledger, [{ id: 'arroz', name: 'Arroz 1kg' }, { id: 'cafe', name: 'Café' }], '2026-09-15T12:00:00Z')
        expect(anchored).toEqual([{ id: 'arroz', name: 'Arroz 1kg', countDate: '2026-10-01T18:00:00Z' }])
    })

    it('is empty when the date is after every count', () => {
        expect(itemsAnchoredAfter(ledger, [{ id: 'arroz', name: 'Arroz 1kg' }], '2026-10-02T12:00:00Z')).toEqual([])
    })

    it('deduplicates repeated items (same item on several queued lines)', () => {
        const anchored = itemsAnchoredAfter(ledger, [{ id: 'arroz', name: 'Arroz 1kg' }, { id: 'arroz', name: 'Arroz 1kg' }], '2026-09-15T12:00:00Z')
        expect(anchored).toHaveLength(1)
    })
})

describe('buildBackdatedTimestamp', () => {
    it('combines the picked day with the current time-of-day (local)', () => {
        const now = new Date(2026, 9, 4, 14, 30, 45) // local Oct 4 2026, 14:30:45
        const iso = buildBackdatedTimestamp('2026-09-20', now)
        const built = new Date(iso)
        expect(built.getFullYear()).toBe(2026)
        expect(built.getMonth()).toBe(8) // September (local)
        expect(built.getDate()).toBe(20)
        expect(built.getHours()).toBe(14)
        expect(built.getMinutes()).toBe(30)
        expect(built.getSeconds()).toBe(45)
    })

    it('a timestamp built for today sorts after an audit from yesterday', () => {
        const now = new Date(2026, 9, 4, 10, 0, 0)
        const iso = buildBackdatedTimestamp('2026-10-04', now)
        const ledger = [audit(new Date(2026, 9, 3, 18, 0, 0).toISOString(), 'caja_chica')]
        expect(isBackdatedBehindAudit(ledger, 'caja_chica', iso)).toBe(false)
    })

    it('a timestamp backdated behind the audit triggers the warning', () => {
        const now = new Date(2026, 9, 4, 10, 0, 0)
        const iso = buildBackdatedTimestamp('2026-10-02', now)
        const ledger = [audit(new Date(2026, 9, 3, 18, 0, 0).toISOString(), 'caja_chica')]
        expect(isBackdatedBehindAudit(ledger, 'caja_chica', iso)).toBe(true)
    })
})
