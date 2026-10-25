import type { Transaction } from '../types';

// ── Backdate guard: warn before registering a transaction behind a cash audit ─
//
// A cash audit (arqueo) is an ADJUSTMENT carrying `details.realVal`: when the
// ledger replays chronologically (deriveCashFromLedger), it SETs the account to
// the verified physical count — an absolute re-anchor, not a delta. Any
// transaction dated BEFORE that anchor still counts in the P&L, but its cash
// effect is absorbed by the SET and cannot move derived cash, so the gap opens
// as "Diferencia por Conciliar" for the exact amount (incidents 2026-08-02 and
// 2026-10-03 — see lessons.md).

export type CashAccount = 'caja_chica' | 'banco';

const isActiveAuditFor = (tx: Transaction, account: CashAccount): boolean =>
    tx.type === 'ADJUSTMENT' &&
    tx.status !== 'VOIDED' &&
    !tx.voidingTxId &&
    tx.details?.realVal !== undefined &&
    (tx.details?.account ?? tx.details?.method) === account;

/** Latest cash-audit anchor for `account`, or null when it was never audited. */
export function lastCashAuditFor(transactions: Transaction[], account: CashAccount): Transaction | null {
    let latest: Transaction | null = null;
    for (const tx of transactions) {
        if (!isActiveAuditFor(tx, account)) continue;
        if (!latest || new Date(tx.date).getTime() > new Date(latest.date).getTime()) latest = tx;
    }
    return latest;
}

/**
 * True when a transaction dated `txDateISO` against `account` would land
 * before that account's latest cash audit — i.e. the audit's SET would absorb
 * its cash effect and open a "Diferencia por Conciliar".
 */
export function isBackdatedBehindAudit(transactions: Transaction[], account: CashAccount, txDateISO: string): boolean {
    const audit = lastCashAuditFor(transactions, account);
    if (!audit) return false;
    return new Date(txDateISO).getTime() < new Date(audit.date).getTime();
}

/** Of the accounts an operation touches (split = both), those anchored by an audit later than `txDateISO`. */
export function accountsAnchoredAfter(transactions: Transaction[], accounts: CashAccount[], txDateISO: string): CashAccount[] {
    return [...new Set(accounts)].filter(a => isBackdatedBehindAudit(transactions, a, txDateISO));
}

// ── Inventory-count anchors (same absorption risk, stock side) ──────────────
// A physical count (ADJUSTMENT with details.itemDetails[].real) is an absolute
// SET per item when the ledger replays (deriveExpectedStocks) — so a PURCHASE
// backdated behind the item's latest count adds stock the replay cannot
// explain, and healInventoryFromLedger will strip it at the next rehydrate.

const isActiveCountFor = (tx: Transaction, itemId: string): boolean =>
    tx.type === 'ADJUSTMENT' &&
    tx.status !== 'VOIDED' &&
    !tx.voidingTxId &&
    tx.details?.itemsAdjusted !== undefined &&
    Array.isArray(tx.details?.itemDetails) &&
    tx.details.itemDetails.some((it: any) => it?.id === itemId && it.real !== undefined);

/** Latest physical-count anchor covering `itemId`, or null when it was never counted. */
export function lastInventoryCountFor(transactions: Transaction[], itemId: string): Transaction | null {
    let latest: Transaction | null = null;
    for (const tx of transactions) {
        if (!isActiveCountFor(tx, itemId)) continue;
        if (!latest || new Date(tx.date).getTime() > new Date(latest.date).getTime()) latest = tx;
    }
    return latest;
}

/** Of the inventory items a purchase touches, those anchored by a physical count later than `txDateISO`. */
export function itemsAnchoredAfter(
    transactions: Transaction[],
    items: { id: string; name: string }[],
    txDateISO: string,
): { id: string; name: string; countDate: string }[] {
    const unique = new Map(items.map(i => [i.id, i]));
    const anchored: { id: string; name: string; countDate: string }[] = [];
    for (const item of unique.values()) {
        const count = lastInventoryCountFor(transactions, item.id);
        if (count && new Date(txDateISO).getTime() < new Date(count.date).getTime()) {
            anchored.push({ id: item.id, name: item.name, countDate: count.date });
        }
    }
    return anchored;
}

/** User-picked YYYY-MM-DD + current local time-of-day → ISO timestamp (SaleModal's tx-date construction). */
export function buildBackdatedTimestamp(dateStr: string, now: Date = new Date()): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
}
