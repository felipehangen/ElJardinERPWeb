import type { Accounts } from '../types';

export const AccountingActions = {
    // 1. Initialization (Detailed)
    initializeWithEquity: (
        cash: number,
        bank: number,
        inventoryValue: number,
        assetsValue: number
    ): Accounts => {
        const totalAssets = cash + bank + inventoryValue + assetsValue;
        return {
            caja_chica: cash,
            banco: bank,
            inventario: inventoryValue,
            activo_fijo: assetsValue,
            patrimonio: totalAssets, // Aporte Accionista
        };
    },

    // 2. Purchase (Inventario) -> Inventory
    // Asset exchange: cash leaves, inventory enters. No P&L impact, patrimonio unchanged.
    purchaseInventory: (prev: Accounts, amount: number, method: 'caja_chica' | 'banco'): Accounts => {
        return {
            ...prev,
            [method]: prev[method] - amount,
            inventario: prev.inventario + amount
        };
    },

    // Purchase (Asset) -> Fixed Asset
    // Asset exchange: cash leaves, fixed asset enters. No P&L impact, patrimonio unchanged.
    purchaseAsset: (prev: Accounts, amount: number, method: 'caja_chica' | 'banco'): Accounts => {
        return {
            ...prev,
            [method]: prev[method] - amount,
            activo_fijo: prev.activo_fijo + amount
        };
    },

    // 3. Payment (Expense) -> Expense
    // Cash decreases AND equity decreases (loss recognized). Dr. Gastos / Cr. Cash.
    payExpense: (prev: Accounts, amount: number, method: 'caja_chica' | 'banco'): Accounts => {
        return {
            ...prev,
            [method]: prev[method] - amount,
            patrimonio: (prev.patrimonio || 0) - amount
        };
    },

    // 4. Sale
    // Cash increases by revenue, inventory decreases by COGS (if inventoriable),
    // and equity increases by net profit (revenue - COGS).
    registerSale: (
        prev: Accounts,
        salePrice: number,
        cost: number,
        isInventoriable: boolean,
        method: 'caja_chica' | 'banco' | 'split',
        splitAmounts?: { caja_chica: number; banco: number }
    ): Accounts => {
        let newAcc = { ...prev };

        if (method === 'split' && splitAmounts) {
            newAcc.caja_chica += splitAmounts.caja_chica;
            newAcc.banco += splitAmounts.banco;
        } else {
            newAcc[method as 'caja_chica' | 'banco'] += salePrice;
        }

        const netProfit = salePrice - (isInventoriable ? cost : 0);
        newAcc.patrimonio = (newAcc.patrimonio || 0) + netProfit;

        if (isInventoriable) {
            newAcc = {
                ...newAcc,
                inventario: newAcc.inventario - cost
            };
        }
        return newAcc;
    },

    // 5. Production (Inventario -> Producto Transformado)
    // Value moves from Inventory (Ingredients) to Inventory (Finished Product).
    // Total Inventory Value remains constant (Asset Exchange), ignoring labor/overhead for now.
    production: (prev: Accounts): Accounts => {
        // No change in total Asset value, just reclassification inside Inventory.
        // If we were tracking "Raw Mat" vs "Finished Goods" accounts separately, we would shift here.
        // For this simple schema, balances stay same.
        return prev;
    },

    // 6. Inventory Adjustment (Shortfall/Surplus) - Batch
    // diffValue: Positive means LOSS (System > Real). Negative means GAIN (System < Real).
    // Inventory account and patrimonio move together: Dr/Cr Pérdida-Ganancia / Cr/Dr Inventario.
    adjustInventoryValues: (prev: Accounts, totalDiffValue: number): Accounts => {
        if (totalDiffValue > 0) {
            // LOSS (Missing items) -> reduces both inventory asset and equity
            return {
                ...prev,
                inventario: prev.inventario - totalDiffValue,
                patrimonio: (prev.patrimonio || 0) - totalDiffValue
            };
        } else {
            // GAIN (Found items) -> increases both inventory asset and equity
            const absDiff = Math.abs(totalDiffValue);
            return {
                ...prev,
                inventario: prev.inventario + absDiff,
                patrimonio: (prev.patrimonio || 0) + absDiff
            };
        }
    },

    // 7. Audit (Missing/Surplus Cash)
    // Cash account is set to real value; the difference hits equity (loss or gain).
    // Dr. Pérdida por Ajuste / Cr. Cash  (for a shortfall)
    // Dr. Cash / Cr. Ganancia por Ajuste (for a surplus)
    auditCash: (prev: Accounts, systemValue: number, realValue: number, account: 'caja_chica' | 'banco'): Accounts => {
        const diff = systemValue - realValue; // positive = shortfall (we lost cash)
        if (diff > 0) {
            return {
                ...prev,
                [account]: prev[account] - diff,
                patrimonio: (prev.patrimonio || 0) - diff
            };
        }
        return {
            ...prev,
            [account]: prev[account] + Math.abs(diff),
            patrimonio: (prev.patrimonio || 0) + Math.abs(diff)
        };
    }
};
