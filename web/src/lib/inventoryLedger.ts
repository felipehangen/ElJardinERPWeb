import type { Transaction, InventoryItem } from '../types';

// ── Inventory ledger audit (SHADOW MODE) ────────────────────────────────────
// Derives each item's EXPECTED stock from the transaction log and compares it
// against the physical inventory array. Same model as cash's self-healing:
//
//   expected(item) = anchor + Σ purchases after anchor
//                    − Σ production ingredient use after anchor
//                    + Σ production output after anchor
//
//   anchor = the item's latest physical count `real` (an absolute SET, like a
//   cash audit's realVal), else its onboarding stock, else 0.
//
// Sales do NOT move stock (periodic model). VOIDED txs and their [ANULACIÓN]
// contras are skipped — together they net to zero.
//
// WHY: the cloud merge unions the transaction LOG but takes the inventory
// ARRAY last-write-wins, so a stale window can revert counts/purchases in the
// array while their txs stay booked (incidents 2026-06-30 and 2026-07-07).
// Cash self-heals from the log; inventory does not — yet. This audit is the
// shadow phase: it only DETECTS divergence (console + event), never mutates.
// Once it proves quiet in production, the derivation can become authoritative.

export interface InventoryDrift {
    id: string;
    name: string;
    expectedStock: number;
    actualStock: number;
    valueDelta: number; // (actual − expected) × cost; positive = phantom stock
}

const num = (v: unknown): number => {
    const n = typeof v === 'string' ? parseFloat(v) : (v as number);
    return Number.isFinite(n) ? n : 0;
};

export function auditInventoryAgainstLedger(
    transactions: Transaction[],
    inventory: InventoryItem[],
    toleranceValue = 1,
): InventoryDrift[] {
    if (!Array.isArray(transactions) || !Array.isArray(inventory)) return [];

    // Chronological replay; skip voided originals and their contra entries.
    const live = transactions
        .filter(t => t.status !== 'VOIDED' && !t.voidingTxId)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // expected stock per item id; `seen` = items the ledger actually references
    // (an array item with no ledger history at all is out of scope — e.g. a
    // catalog entry created by hand — so we don't false-alarm on it).
    const expected = new Map<string, number>();
    const seen = new Set<string>();
    const setStock = (id: string, v: number) => { expected.set(id, v); seen.add(id); };
    const addStock = (id: string, dv: number) => { expected.set(id, (expected.get(id) ?? 0) + dv); seen.add(id); };

    for (const tx of live) {
        const d: any = tx.details;
        if (!d) continue;

        if (tx.type === 'INITIALIZATION' && Array.isArray(d.inventoryDetails)) {
            for (const it of d.inventoryDetails) if (it?.id) setStock(it.id, num(it.stock));
            continue;
        }

        if (tx.type === 'PURCHASE' && (d.type ?? 'inventory') === 'inventory' && d.itemId && num(d.quantity) > 0) {
            addStock(d.itemId, num(d.quantity));
            continue;
        }

        if (tx.type === 'ADJUSTMENT' && d.itemsAdjusted !== undefined && Array.isArray(d.itemDetails)) {
            // Physical count: `real` is an absolute anchor for each counted item.
            for (const it of d.itemDetails) if (it?.id && it.real !== undefined) setStock(it.id, num(it.real));
            continue;
        }

        if (tx.type === 'PRODUCTION') {
            if (Array.isArray(d.ingredients)) {
                for (const ing of d.ingredients) {
                    const id = ing?.item?.id ?? ing?.itemId;
                    if (id) addStock(id, -num(ing.qty));
                }
            }
            if (d.outputId) addStock(d.outputId, num(d.outputQty));
        }
    }

    // Compare against the array — only items the ledger knows about.
    const drifts: InventoryDrift[] = [];
    for (const item of inventory) {
        if (!seen.has(item.id)) continue;
        const exp = expected.get(item.id) ?? 0;
        const delta = item.stock - exp;
        if (Math.abs(delta) < 0.0001) continue;
        const valueDelta = Number((delta * item.cost).toFixed(2));
        if (Math.abs(valueDelta) < toleranceValue) continue;
        drifts.push({
            id: item.id, name: item.name,
            expectedStock: Number(exp.toFixed(4)),
            actualStock: item.stock,
            valueDelta,
        });
    }
    return drifts.sort((a, b) => Math.abs(b.valueDelta) - Math.abs(a.valueDelta));
}

// Total absolute drift value — the alarm threshold input.
export function totalDriftValue(drifts: InventoryDrift[]): number {
    return Number(drifts.reduce((s, d) => s + Math.abs(d.valueDelta), 0).toFixed(2));
}
