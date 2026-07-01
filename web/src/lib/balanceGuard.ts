import type { Transaction, Accounts } from '../types';

// ── Save-time balance guard ─────────────────────────────────────────────────
// Pure re-implementation of the "Diferencia por Conciliar" formula
// (getLedgerAccounts() + Reports.tsx) so the persistence layer can detect an
// UNBALANCED state at save time and raise an alarm.
//
// WHY THIS EXISTS: cash/inventario/patrimonio are derived by reconcile(), but
// the cloud merge (mergeTransactionLogs) union-merges only the transaction log
// and takes inventory/assets wholesale from the newest blob (last-write-wins).
// Cash self-heals from the log; inventory does NOT. So a stale inventory array
// from another tab/device (or a backup restore) can silently desync from the
// log while its physical-count COGS stays booked — reopening the Diferencia.
// This guard turns that silent corruption into a loud, immediate warning.
//
// ADVISORY ONLY: it never blocks a save and never mutates data. If it ever
// drifts from getLedgerAccounts(), the only cost is a false/missed warning.
// Keep this formula in sync with useStore.getLedgerAccounts + Reports.tsx.

export interface BalanceState {
    transactions: Transaction[];
    accounts: Accounts;
}

export function computeDiferencia(state: BalanceState): number {
    const { transactions, accounts } = state;
    if (!Array.isArray(transactions) || !accounts) return 0;

    const valid = transactions.filter(t => t.status !== 'VOIDED');
    const adj = valid.filter(t => t.type === 'ADJUSTMENT' && !t.voidingTxId);

    const ventas = valid.filter(t => t.type === 'SALE').reduce((a, t) => a + (t.amount || 0), 0);
    const gastos = valid.filter(t => t.type === 'EXPENSE').reduce((a, t) => a + (t.amount || 0), 0);

    // Cost of goods sold (periodic model): sale COGS + inventory physical counts.
    const salesCogs = valid.filter(t => t.type === 'SALE').reduce((a, t) => a + (t.cogs || 0), 0);
    const invCountCogs = adj
        .filter(t => t.details?.itemsAdjusted !== undefined)
        .reduce((a, t) => a + (t.cogs !== undefined ? t.cogs : t.amount), 0);
    const costos = salesCogs + invCountCogs;

    // Cash audits → other income / expense, classified per-account by its own diff.
    const cashAdj = adj.filter(t => {
        const m = t.details?.method, ac = t.details?.account;
        return m === 'caja_chica' || m === 'banco' || ac === 'caja_chica' || ac === 'banco';
    });
    const cashOtrosIngresos = cashAdj.reduce((a, t) => {
        const dc = t.details?.diffCaja, db = t.details?.diffBanco;
        let g = 0;
        if (dc !== undefined && dc < 0) g += Math.abs(dc);
        if (db !== undefined && db < 0) g += Math.abs(db);
        return a + g;
    }, 0);
    const cashOtrosGastos = cashAdj.reduce((a, t) => {
        const dc = t.details?.diffCaja, db = t.details?.diffBanco;
        let l = 0;
        if (dc !== undefined && dc > 0) l += Math.abs(dc);
        if (db !== undefined && db > 0) l += Math.abs(db);
        return a + l;
    }, 0);

    // Asset physical-count adjustments → other income / expense.
    const assetAdj = adj.filter(t => t.details?.diff !== undefined && t.details?.itemsAdjusted === undefined);
    const assetOtrosGastos = assetAdj.reduce((a, t) => {
        const d = t.details?.assetDiff ?? t.cogs ?? 0;
        return d > 0 ? a + (t.amount || 0) : a;
    }, 0);
    const assetOtrosIngresos = assetAdj.reduce((a, t) => {
        const d = t.details?.assetDiff ?? t.cogs ?? 0;
        return d < 0 ? a + (t.amount || 0) : a;
    }, 0);

    const otrosIngresos = cashOtrosIngresos + assetOtrosIngresos;
    const otrosGastos = cashOtrosGastos + assetOtrosGastos;

    // Initial capital = Σ INITIALIZATION amounts (fallback to patrimonio, matching Reports.tsx).
    const totalIC = transactions
        .filter(t => t.type === 'INITIALIZATION' && t.status !== 'VOIDED')
        .reduce((a, t) => a + (t.amount || 0), 0);
    const initialCapital = totalIC > 0 ? totalIC : accounts.patrimonio;

    const resultados = ventas - costos - gastos + otrosIngresos - otrosGastos;
    return Number(((accounts.patrimonio || 0) - (initialCapital + resultados)).toFixed(2));
}

// Threshold below which a gap is treated as noise rather than a real desync.
// Physical counts value inventory at AVERAGE cost but book COGS at FIFO cost, so
// each count leaves a few colones of unavoidable rounding that accumulate over
// time (e.g. ~₡33 after a dozen counts). A genuine stale-array desync is orders
// of magnitude larger (this bug reopened at ₡44,607), so ₡500 suppresses the
// harmless noise while still catching any material clobber.
export const DIFERENCIA_TOLERANCE = 500;
