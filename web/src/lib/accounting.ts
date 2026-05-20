import type { Accounts } from '../types';

/**
 * AccountingActions — CASH-ONLY mutations.
 *
 * These functions only touch `banco` and `caja_chica`.
 * `inventario`, `activo_fijo`, and `patrimonio` are DERIVED fields:
 *
 *   inventario  = Σ (item.stock × item.cost)   — from the inventory array
 *   activo_fijo = Σ (asset.value)              — from the assets array
 *   patrimonio  = banco + caja_chica + inventario + activo_fijo
 *
 * Call `reconcile()` (store action) after any physical inventory/asset mutation
 * to keep those three fields in sync.  The equation is then structurally guaranteed
 * rather than maintained by hand in every code path.
 */
export const AccountingActions = {

    // 1. Initialization — sets opening cash balances only.
    //    Inventory and asset values come from their physical arrays via reconcile().
    initializeWithEquity: (
        cash: number,
        bank: number,
        _inventoryValue?: number,   // kept for API compat, ignored — derived by reconcile
        _assetsValue?: number       // kept for API compat, ignored — derived by reconcile
    ): Accounts => ({
        caja_chica: cash,
        banco: bank,
        inventario: 0,      // will be overwritten by reconcile()
        activo_fijo: 0,     // will be overwritten by reconcile()
        patrimonio: cash + bank, // rough; reconcile() sets the final value
    }),

    // 2. Purchase Inventory — cash out, inventory in (physical array updated separately).
    purchaseInventory: (prev: Accounts, amount: number, method: 'caja_chica' | 'banco'): Accounts => ({
        ...prev,
        [method]: prev[method] - amount,
        // inventario: handled by reconcile() after addInventoryItem / updateInventoryItem
    }),

    // 3. Purchase Asset — cash out, fixed asset in (physical array updated separately).
    purchaseAsset: (prev: Accounts, amount: number, method: 'caja_chica' | 'banco'): Accounts => ({
        ...prev,
        [method]: prev[method] - amount,
        // activo_fijo: handled by reconcile() after addAssetItem
    }),

    // 4. Expense — cash out, equity decreases (via reconcile: banco drops → patrimonio drops).
    payExpense: (prev: Accounts, amount: number, method: 'caja_chica' | 'banco'): Accounts => ({
        ...prev,
        [method]: prev[method] - amount,
        // patrimonio: auto-derived by reconcile()
    }),

    // 5. Sale — cash in.  COGS and patrimonio change are handled by reconcile().
    //    (Periodic inventory model: COGS recognised at physical count, not at sale.)
    registerSale: (
        prev: Accounts,
        salePrice: number,
        method: 'caja_chica' | 'banco' | 'split',
        splitAmounts?: { caja_chica: number; banco: number }
    ): Accounts => {
        if (method === 'split' && splitAmounts) {
            return {
                ...prev,
                caja_chica: prev.caja_chica + splitAmounts.caja_chica,
                banco: prev.banco + splitAmounts.banco,
            };
        }
        return {
            ...prev,
            [method as 'caja_chica' | 'banco']: prev[method as 'caja_chica' | 'banco'] + salePrice,
        };
    },

    // 6. Production — pure asset exchange inside inventory; no cash movement.
    //    reconcile() sees net-zero change to inventory value (ingredients out = output in).
    production: (prev: Accounts): Accounts => prev,

    // 7. Inventory count adjustment — physical array already updated by caller.
    //    reconcile() picks up the new inventory value automatically.
    adjustInventoryValues: (prev: Accounts, _totalDiffValue?: number): Accounts => prev,

    // 8. Cash audit — sets cash account to the verified real value.
    //    patrimonio adjusts automatically via reconcile().
    auditCash: (
        prev: Accounts,
        _systemValue: number,       // kept for API compat
        realValue: number,
        account: 'caja_chica' | 'banco'
    ): Accounts => ({
        ...prev,
        [account]: realValue,
        // patrimonio: auto-derived by reconcile()
    }),
};
