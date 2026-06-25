import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from '../store/useStore'
import { INITIAL_STATE } from '../types'
import type { Transaction } from '../types'

vi.mock('../store/cloudStorage', () => ({
    cloudStorage: {
        getItem: vi.fn(async () => null),
        setItem: vi.fn(async () => {}),
        removeItem: vi.fn(async () => {}),
    },
    CLOUD_STORAGE_KEY: 'jardin-erp-storage-v4',
}))

// ── Helpers ──────────────────────────────────────────────────────────────────
// Build the transaction LOG only. We deliberately do NOT touch accounts.banco /
// accounts.caja_chica when seeding — the whole point of the fix is that
// reconcile() derives those two balances from the log, so the test asserts the
// log alone determines cash.
let seq = 0
const at = (mins: number) => new Date(Date.UTC(2026, 0, 1, 0, mins, 0)).toISOString()

function seed(transactions: Transaction[], accountsOverride?: Partial<typeof INITIAL_STATE.accounts>) {
    useStore.setState({
        ...INITIAL_STATE,
        initialized: true,
        // Transactions are stored newest-first in the real app; reverse so the
        // array order is hostile to chronological logic and only `date` is trustworthy.
        transactions: [...transactions].reverse(),
        accounts: { ...INITIAL_STATE.accounts, ...accountsOverride },
    })
}

const onboarding = (cash: number, bank: number): Transaction => ({
    id: `init-${seq++}`, type: 'INITIALIZATION', date: at(0),
    amount: cash + bank, description: 'Aporte de Capital Inicial (Onboarding)',
    details: { isInitialOnboarding: true, cash, bank, inventoryValue: 0, assetsValue: 0 },
})
const sale = (amount: number, method: 'caja_chica' | 'banco', min: number): Transaction => ({
    id: `sale-${seq++}`, type: 'SALE', date: at(min), amount, cogs: 0,
    description: 'Venta', details: { method, cart: [] },
})
const splitSale = (caja: number, banco: number, min: number): Transaction => ({
    id: `sale-split-${seq++}`, type: 'SALE', date: at(min), amount: caja + banco, cogs: 0,
    description: 'Venta split', details: { method: 'split', splitAmounts: { caja_chica: caja, banco }, cart: [] },
})
const expense = (amount: number, method: 'caja_chica' | 'banco', min: number): Transaction => ({
    id: `exp-${seq++}`, type: 'EXPENSE', date: at(min), amount,
    description: 'Gasto', details: { typeName: 'Test', method },
})
const purchase = (amount: number, method: 'caja_chica' | 'banco', min: number): Transaction => ({
    id: `pur-${seq++}`, type: 'PURCHASE', date: at(min), amount,
    description: 'Compra', details: { type: 'inventory', itemName: 'X', quantity: 1, method },
})
// Cash audit that records the verified real balance (modern shape: sysVal + realVal).
const cashAudit = (account: 'caja_chica' | 'banco', sysVal: number, realVal: number, min: number): Transaction => ({
    id: `audit-${seq++}`, type: 'ADJUSTMENT', date: at(min), amount: Math.abs(sysVal - realVal),
    description: `Ajuste ${account}`,
    details: { method: account, account, sysVal, realVal, [account === 'caja_chica' ? 'diffCaja' : 'diffBanco']: sysVal - realVal },
})
// Inventory physical count — touches inventory value, NOT cash.
const inventoryCount = (min: number): Transaction => ({
    id: `inv-${seq++}`, type: 'ADJUSTMENT', date: at(min), amount: 100, cogs: 100,
    description: 'Toma Física', details: { itemsAdjusted: 1, exactTotalDiff: 100, counts: {}, itemDetails: [] },
})
// Reverse `original` exactly the way revertTransaction does: mark original VOIDED
// and append the [ANULACIÓN] contra (ADJUSTMENT, voidingTxId, details:null).
function voidOf(original: Transaction, min: number): { voided: Transaction; contra: Transaction } {
    return {
        voided: { ...original, status: 'VOIDED', voidingTxId: `contra-${original.id}` },
        contra: {
            id: `contra-${original.id}`, type: 'ADJUSTMENT', date: at(min), amount: original.amount,
            description: `[ANULACIÓN] Reversa de Transacción: ${original.id}`, voidingTxId: original.id,
        } as Transaction,
    }
}

const cash = () => {
    const a = useStore.getState().accounts
    return { banco: a.banco, caja_chica: a.caja_chica }
}

beforeEach(() => { seq = 0; useStore.setState(INITIAL_STATE) })

// ───────────────────────────────────────────────────────────────────────────
describe('reconcile() — cash is DERIVED from the transaction log', () => {

    it('1. opening balances come from the onboarding INITIALIZATION', () => {
        seed([onboarding(1000, 2000)])
        useStore.getState().reconcile()
        expect(cash()).toEqual({ caja_chica: 1000, banco: 2000 })
    })

    it('2. a sale adds to the chosen cash account', () => {
        seed([onboarding(1000, 2000), sale(500, 'caja_chica', 5)])
        useStore.getState().reconcile()
        expect(cash()).toEqual({ caja_chica: 1500, banco: 2000 })
    })

    it('3. a split sale adds to both accounts', () => {
        seed([onboarding(1000, 2000), splitSale(300, 200, 5)])
        useStore.getState().reconcile()
        expect(cash()).toEqual({ caja_chica: 1300, banco: 2200 })
    })

    it('4. expenses and purchases subtract from the chosen account', () => {
        seed([onboarding(1000, 2000), expense(100, 'banco', 5), purchase(50, 'caja_chica', 6)])
        useStore.getState().reconcile()
        expect(cash()).toEqual({ caja_chica: 950, banco: 1900 })
    })

    it('5. inventory physical count does NOT move cash', () => {
        seed([onboarding(1000, 2000), inventoryCount(5)])
        useStore.getState().reconcile()
        expect(cash()).toEqual({ caja_chica: 1000, banco: 2000 })
    })

    it('6. a cash audit SETS the account to the verified real value (absolute, not delta)', () => {
        // System thinks caja = 1500 after the sale, but the physical count is 1200.
        seed([onboarding(1000, 2000), sale(500, 'caja_chica', 5), cashAudit('caja_chica', 1500, 1200, 6)])
        useStore.getState().reconcile()
        expect(cash().caja_chica).toBe(1200)
        expect(cash().banco).toBe(2000)
    })

    it('7. REGRESSION (Bug 3): reconcile heals cash corrupted by a stale-tab overwrite', () => {
        // The log says caja should be 1400, banco 1900. Simulate a bad sync that
        // overwrote the stored running balances with garbage.
        seed(
            [onboarding(1000, 2000), sale(500, 'caja_chica', 5), expense(100, 'caja_chica', 6), expense(100, 'banco', 7)],
            { caja_chica: 999999, banco: -42 },
        )
        useStore.getState().reconcile()
        expect(cash()).toEqual({ caja_chica: 1400, banco: 1900 })
    })

    it('8. a void reverses the cash effect of its original transaction', () => {
        const s = sale(500, 'banco', 5)
        const { voided, contra } = voidOf(s, 6)
        seed([onboarding(1000, 2000), voided, contra])
        useStore.getState().reconcile()
        expect(cash()).toEqual({ caja_chica: 1000, banco: 2000 })
    })

    it('9. a void BEFORE a later audit is absorbed by the audit (audit wins)', () => {
        // Sale +500 caja, then a physical count sets caja to 1200, THEN the sale is voided.
        // The audit already counted reality; the data-void must not subtract counted cash.
        const s = sale(500, 'caja_chica', 5)
        const { voided, contra } = voidOf(s, 8)
        seed([onboarding(1000, 2000), voided, cashAudit('caja_chica', 1500, 1200, 6), contra])
        useStore.getState().reconcile()
        expect(cash().caja_chica).toBe(1200)
    })

    it('10. patrimonio = derived cash + inventario + activo_fijo', () => {
        seed([onboarding(1000, 2000), sale(500, 'banco', 5)])
        useStore.setState({
            inventory: [{ id: 'i1', name: 'X', cost: 10, stock: 3 }],
            assets: [{ id: 'a1', name: 'A', value: 250, quantity: 1 }],
        })
        useStore.getState().reconcile()
        const a = useStore.getState().accounts
        expect(a.caja_chica).toBe(1000)
        expect(a.banco).toBe(2500)
        expect(a.inventario).toBe(30)
        expect(a.activo_fijo).toBe(250)
        expect(a.patrimonio).toBe(1000 + 2500 + 30 + 250)
    })

    it('11. chronology is driven by date, not array position (audit then later sale)', () => {
        // Array order is hostile (newest-first); only dates are correct.
        // audit sets caja=1200 at min 6, then a sale at min 9 adds 50.
        seed([onboarding(1000, 2000), sale(500, 'caja_chica', 5), cashAudit('caja_chica', 1500, 1200, 6), sale(50, 'caja_chica', 9)])
        useStore.getState().reconcile()
        expect(cash().caja_chica).toBe(1250)
    })
})
