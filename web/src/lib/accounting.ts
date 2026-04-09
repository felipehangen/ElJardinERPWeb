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
    purchaseInventory: (prev: Accounts, amount: number, method: 'caja_chica' | 'banco'): Accounts => {
        return {
            ...prev,
            [method]: prev[method] - amount,
            inventario: prev.inventario + amount
        };
    },

    // Purchase (Asset) -> Fixed Asset
    purchaseAsset: (prev: Accounts, amount: number, method: 'caja_chica' | 'banco'): Accounts => {
        return {
            ...prev,
            [method]: prev[method] - amount,
            activo_fijo: prev.activo_fijo + amount
        };
    },

    // 3. Payment (Expense) -> Expense
    payExpense: (prev: Accounts, amount: number, method: 'caja_chica' | 'banco'): Accounts => {
        return {
            ...prev,
            [method]: prev[method] - amount
        };
    },

    // 4. Sale
    registerSale: (
        prev: Accounts,
        salePrice: number,
        cost: number,
        isInventoriable: boolean,
        method: 'caja_chica' | 'banco'
    ): Accounts => {
        let newAcc = {
            ...prev,
            [method]: prev[method] + salePrice
        };

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
    adjustInventoryValues: (prev: Accounts, totalDiffValue: number): Accounts => {
        if (totalDiffValue > 0) {
            // LOSS (Missing items) -> Expense/Cost
            return {
                ...prev,
                inventario: prev.inventario - totalDiffValue
            };
        } else {
            // GAIN (Found items) -> Reduce Cost
            const absDiff = Math.abs(totalDiffValue);
            return {
                ...prev,
                inventario: prev.inventario + absDiff
            };
        }
    },

    // 7. Audit (Missing Cash)
    auditCash: (prev: Accounts, systemValue: number, realValue: number, account: 'caja_chica' | 'banco'): Accounts => {
        const diff = systemValue - realValue; // System 100, Real 90, Diff 10 (Missing)
        if (diff > 0) {
            return {
                ...prev,
                [account]: prev[account] - diff
            };
        }
        // If Surplus, treated as Gain (Revenue) or Expense Reduction. Simplified as Other Income (Sale) here?
        // For safety, let's treat as Sales/Other Income
        return {
            ...prev,
            [account]: prev[account] + Math.abs(diff)
        };
    }
};
