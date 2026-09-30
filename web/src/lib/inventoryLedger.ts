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
// array while their txs stay booked (incidents 2026-06-30, 07-07, 07-31 and
// 08-22 — the last three caught live by this audit). Cash self-heals from the
// log; inventory now does too: healInventoryFromLedger (below) is AUTHORITATIVE
// at rehydrate, and the save-time audit stays on as a watchdog.

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

// Replay the ledger chronologically → expected stock per item id, plus the set
// of items the ledger actually references (an array item with no ledger history
// at all is out of scope — e.g. a catalog entry created by hand).
export function deriveExpectedStocks(transactions: Transaction[]): { expected: Map<string, number>; seen: Set<string> } {
    // Chronological replay; skip voided originals and their contra entries.
    const live = transactions
        .filter(t => t.status !== 'VOIDED' && !t.voidingTxId)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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

    return { expected, seen };
}

export function auditInventoryAgainstLedger(
    transactions: Transaction[],
    inventory: InventoryItem[],
    toleranceValue = 1,
): InventoryDrift[] {
    if (!Array.isArray(transactions) || !Array.isArray(inventory)) return [];
    const { expected, seen } = deriveExpectedStocks(transactions);

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

// ── AUTHORITATIVE healing (promoted 2026-08 after four live catches) ────────
// Rewrites any drifted item's stock to the ledger-derived value — the inventory
// equivalent of deriveCashFromLedger's self-healing. Runs at REHYDRATE time
// only (the one door a clobber enters through: a sync merge, a restore, or a
// stale/old-version client's write). NOT run per-transaction: several handlers
// mutate the array before their addTransaction lands, so an in-flow derivation
// would revert legitimate mutations.
//
// VALUE preservation (v1.1.18): when healing REDUCES stock, drain batches
// LIFO (newest first) instead of collapsing at the current average. The drift
// being healed is always "recent mutations replayed wrong", so removing the
// newest layers undoes exactly the suspect value and keeps historical costs
// intact. The old collapse-at-average froze whatever the average happened to
// be: on 2026-09-30 a typo purchase had poisoned an item's average to
// ₡477.50/u, the user voided it, and the heal re-froze 100 old ₡5 units at
// that poisoned average — ₡47,250 of phantom value with perfect stock.
// When healing ADDS stock, the missing quantity enters at the current average
// (no better information exists). Booked COGS is never touched.
export function healInventoryFromLedger(
    transactions: Transaction[],
    inventory: InventoryItem[],
): { inventory: InventoryItem[]; healed: InventoryDrift[] } {
    const drifts = auditInventoryAgainstLedger(transactions, inventory);
    if (drifts.length === 0) return { inventory, healed: [] };

    const EPS = 1e-9;
    const fix = new Map(drifts.map(d => [d.id, d.expectedStock]));
    const healedInventory = inventory.map(item => {
        const target = fix.get(item.id);
        if (target === undefined || Math.abs(target - item.stock) < EPS) return item;

        // Normalize: real batches, else one synthetic batch at the avg cost.
        // Phantom stock (stock beyond the batch sum) tops up at avg cost, dated
        // now — newest, so a reduction drains the least-trusted value first.
        let batches = (item.batches && item.batches.length > 0)
            ? item.batches.map(b => ({ ...b }))
            : [{ id: 'legacy-' + item.id, date: new Date(0).toISOString(), cost: item.cost, stock: item.stock }];
        const batchTotal = batches.reduce((s, b) => s + b.stock, 0);
        if (batchTotal < item.stock - EPS) {
            batches.push({ id: 'phantom-' + item.id, date: new Date().toISOString(), cost: item.cost, stock: item.stock - batchTotal });
        }

        if (target < item.stock) {
            // REDUCTION: drain LIFO (newest first), preserving older layers' costs.
            let toRemove = batches.reduce((s, b) => s + b.stock, 0) - target;
            batches.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const kept: typeof batches = [];
            for (const b of batches) {
                if (toRemove <= EPS) { kept.push(b); continue; }
                if (b.stock <= toRemove + EPS) { toRemove -= b.stock; }
                else { kept.push({ ...b, stock: b.stock - toRemove }); toRemove = 0; }
            }
            batches = kept.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        } else {
            // INCREASE: add the missing quantity at the current average cost.
            batches.push({
                id: 'heal-' + item.id + '-' + target,
                date: new Date().toISOString(),
                cost: item.cost,
                stock: target - item.stock,
            });
        }

        const value = batches.reduce((s, b) => s + b.stock * b.cost, 0);
        const cost = target > EPS ? value / target : item.cost;
        return { ...item, stock: target, cost, batches };
    });
    return { inventory: healedInventory, healed: drifts };
}
