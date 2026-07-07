import type { InventoryItem } from '../types';

// Pre-confirmation summary of a physical inventory count.
// Values are estimated at weighted-average cost — the actual booking drains
// FIFO batches, so the exact loss can differ slightly for faltantes.

export interface CountAdjustment {
    id: string;
    name: string;
    sys: number;       // system stock before the count
    real: number;      // counted physical stock
    qtyDiff: number;   // real - sys; positive = sobrante, negative = faltante
    valueDiff: number; // qtyDiff × avg cost; positive = ganancia, negative = pérdida
}

export interface CountSummary {
    items: CountAdjustment[];
    itemsAdjusted: number;
    totalValueDiff: number; // positive = ganancia, negative = pérdida
    isLoss: boolean;
}

export const summarizeInventoryCount = (
    counts: Record<string, string>,
    inventory: InventoryItem[],
): CountSummary => {
    const items: CountAdjustment[] = [];

    Object.entries(counts).forEach(([id, valStr]) => {
        const item = inventory.find(i => i.id === id);
        if (!item) return;

        const real = parseFloat(valStr || '0');
        if (!Number.isFinite(real)) return;

        const qtyDiff = real - item.stock;
        if (qtyDiff === 0) return;

        items.push({
            id,
            name: item.name,
            sys: item.stock,
            real,
            qtyDiff,
            valueDiff: qtyDiff * item.cost,
        });
    });

    const totalValueDiff = items.reduce((sum, i) => sum + i.valueDiff, 0);

    return {
        items,
        itemsAdjusted: items.length,
        totalValueDiff,
        isLoss: totalValueDiff < 0,
    };
};
