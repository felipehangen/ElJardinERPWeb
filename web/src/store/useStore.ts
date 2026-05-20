import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { cloudStorage } from './cloudStorage';
import { INITIAL_STATE } from '../types';
import type { AppState, Accounts, InventoryItem, Product, Transaction, Provider, ExpenseType, AssetItem, Location } from '../types';

interface StoreActions {
    setInitialized: (val: boolean) => void;
    updateAccounts: (fn: (prev: Accounts) => Accounts) => void;

    // Inventory
    addInventoryItem: (item: InventoryItem) => void;
    updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => void;
    deleteInventoryItem: (id: string) => void;

    // Assets
    addAssetItem: (item: AssetItem) => void;
    updateAssetItem: (id: string, updates: Partial<AssetItem>) => void;
    deleteAssetItem: (id: string) => void;

    // Products
    addProduct: (item: Product) => void;
    updateProduct: (id: string, updates: Partial<Product>) => void;
    deleteProduct: (id: string) => void;

    // Locations
    addLocation: (item: Location) => void;
    updateLocation: (id: string, updates: Partial<Location>) => void;
    deleteLocation: (id: string) => void;

    // Providers
    addProvider: (item: Provider) => void;
    updateProvider: (id: string, updates: Partial<Provider>) => void;
    deleteProvider: (id: string) => void;

    // Expense Types
    addExpenseType: (item: ExpenseType) => void;
    updateExpenseType: (id: string, updates: Partial<ExpenseType>) => void;
    deleteExpenseType: (id: string) => void;

    // Transactions
    addTransaction: (tx: Transaction) => void;
    updateTransaction: (id: string, updates: Partial<Transaction>) => void;

    // Batches
    batchUpdateInventory: (updates: InventoryItem[]) => void;
    batchUpdateAssets: (updates: AssetItem[]) => void;

    // Ledger Methods
    getLedgerAccounts: (startDate?: Date | null, endDate?: Date | null) => Accounts & { ventas: number, gastos: number, costos: number, otrosIngresos: number, otrosGastos: number };
    consumeInventoryFIFO: (itemId: string, quantityToConsume: number) => number; // Returns COGS
    simulateInventoryFIFO: (itemId: string, qty: number) => number;
    revertTransaction: (txId: string) => void;

    // Derived-field reconciliation
    // Call after any operation that changes inventory[], assets[], banco, or caja_chica.
    // Recomputes inventario, activo_fijo, and patrimonio so they are always consistent.
    reconcile: () => void;

    // System
    importState: (state: AppState) => void;
    reset: () => void;
}

export const useStore = create<AppState & StoreActions>()(
    persist(
        (set, get) => ({
            ...INITIAL_STATE,
            setInitialized: (val) => set({ initialized: val }),
            updateAccounts: (updater) => {
                let updated = typeof updater === 'function' ? updater(get().accounts) : updater;
                updated._isLedger = true;
                set({ accounts: updated });
            },

            // Recompute the three derived balance-sheet fields from their physical sources.
            // inventario  = Σ item.stock × item.cost   (inventory array is ground truth)
            // activo_fijo = Σ asset.value               (assets array is ground truth)
            // patrimonio  = banco + caja_chica + inventario + activo_fijo  (equation)
            reconcile: () => {
                const s = get();
                const inventario = Number(s.inventory.reduce((sum, i) => sum + i.stock * i.cost, 0).toFixed(2));
                const activo_fijo = Number(s.assets.reduce((sum, a) => sum + a.value, 0).toFixed(2));
                const patrimonio = Number(((s.accounts.banco || 0) + (s.accounts.caja_chica || 0) + inventario + activo_fijo).toFixed(2));
                set({ accounts: { ...s.accounts, inventario, activo_fijo, patrimonio, _isLedger: true } });
            },

            addInventoryItem: (item) => set((state) => ({ inventory: [...state.inventory, item] })),
            updateInventoryItem: (id, updates) => set((state) => ({
                inventory: state.inventory.map((i) => (i.id === id ? { ...i, ...updates } : i)),
            })),
            deleteInventoryItem: (id) => set((state) => ({ inventory: state.inventory.filter((i) => i.id !== id) })),

            addAssetItem: (item) => set((state) => ({ assets: [...state.assets, item] })),
            updateAssetItem: (id, updates) => set((state) => ({
                assets: state.assets.map((i) => (i.id === id ? { ...i, ...updates } : i)),
            })),
            deleteAssetItem: (id) => set((state) => ({ assets: state.assets.filter((i) => i.id !== id) })),

            addProduct: (item) => set((state) => ({ products: [...state.products, item] })),
            updateProduct: (id, updates) => set((state) => ({
                products: state.products.map((p) => (p.id === id ? { ...p, ...updates } : p)),
            })),
            deleteProduct: (id) => set((state) => ({ products: state.products.filter((p) => p.id !== id) })),

            addLocation: (item) => set((state) => ({ locations: [...state.locations, item] })),
            updateLocation: (id, updates) => set((state) => ({
                locations: state.locations.map((p) => (p.id === id ? { ...p, ...updates } : p)),
            })),
            deleteLocation: (id) => set((state) => ({ locations: state.locations.filter((p) => p.id !== id) })),

            addProvider: (item) => set((state) => ({ providers: [...state.providers, item] })),
            updateProvider: (id, updates) => set((state) => ({
                providers: state.providers.map((p) => (p.id === id ? { ...p, ...updates } : p)),
            })),
            deleteProvider: (id) => set((state) => ({ providers: state.providers.filter((p) => p.id !== id) })),

            addExpenseType: (item) => set((state) => ({ expenseTypes: [...state.expenseTypes, item] })),
            updateExpenseType: (id, updates) => set((state) => ({
                expenseTypes: state.expenseTypes.map((p) => (p.id === id ? { ...p, ...updates } : p)),
            })),
            deleteExpenseType: (id) => set((state) => ({ expenseTypes: state.expenseTypes.filter((p) => p.id !== id) })),

            addTransaction: (tx) => set((state) => ({ transactions: [tx, ...state.transactions] })),
            updateTransaction: (id, updates) => set((state) => ({
                transactions: state.transactions.map(t => t.id === id ? { ...t, ...updates } : t)
            })),

            getLedgerAccounts: (startDate?: Date | null, endDate?: Date | null) => {
                const state = get();
                const baseAccounts = state.accounts;
                let validTxs = state.transactions.filter(t => t.status !== 'VOIDED');

                if (startDate || endDate) {
                    validTxs = validTxs.filter(t => {
                        const d = new Date(t.date);
                        const matchStart = !startDate || d >= startDate;
                        const matchEnd = !endDate || d <= endDate;
                        return matchStart && matchEnd;
                    });
                }

                // Recalculate historically exactly how Reports does it, but globally
                let ventas = validTxs.filter(t => t.type === 'SALE').reduce((acc, t) => acc + t.amount, 0);
                let gastos = validTxs.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + t.amount, 0);

                // Classify ADJUSTMENT sub-types using structured details fields (not fragile description strings):
                // • details.itemsAdjusted !== undefined  → inventory physical count → COGS
                // • details.diff !== undefined (no itemsAdjusted) → asset count adjustment → otrosGastos/otrosIngresos
                // • details.method is 'caja_chica'/'banco' → cash audit → otrosGastos/otrosIngresos
                const adjTxs = validTxs.filter(t => t.type === 'ADJUSTMENT' && !t.voidingTxId);

                // Inventory physical counts → cost of goods sold (periodic model)
                const salesCogs = validTxs.filter(t => t.type === 'SALE').reduce((acc, t) => acc + (t.cogs || 0), 0);
                const inventoryCountCogs = adjTxs
                    .filter(t => t.details?.itemsAdjusted !== undefined)
                    .reduce((acc, t) => acc + (t.cogs !== undefined ? t.cogs : t.amount), 0);
                const totalCostos = salesCogs + inventoryCountCogs;

                // Cash adjustments → other income / other expense
                // diff > 0: system had MORE than real → cash LOSS → otrosGastos
                // diff < 0: system had LESS than real → cash GAIN → otrosIngresos
                const cashAdjTxs = adjTxs.filter(t =>
                    t.details?.method === 'caja_chica' || t.details?.method === 'banco' ||
                    t.details?.account === 'caja_chica' || t.details?.account === 'banco'
                );
                const cashOtrosIngresos = cashAdjTxs.reduce((acc, t) => {
                    const diff = t.details?.diffCaja ?? t.details?.diffBanco;
                    const isGain = diff !== undefined ? diff < 0 : t.description.includes('+');
                    return isGain ? acc + t.amount : acc;
                }, 0);
                const cashOtrosGastos = cashAdjTxs.reduce((acc, t) => {
                    const diff = t.details?.diffCaja ?? t.details?.diffBanco;
                    const isLoss = diff !== undefined ? diff > 0 : !t.description.includes('+');
                    return isLoss ? acc + t.amount : acc;
                }, 0);

                // Asset count adjustments → other income / other expense (NOT cost of sales)
                // tx.cogs = diff where diff > 0 = loss (system > real), diff < 0 = gain
                const assetAdjTxs = adjTxs.filter(t =>
                    t.details?.diff !== undefined && t.details?.itemsAdjusted === undefined
                );
                const assetOtrosGastos = assetAdjTxs.reduce((acc, t) => {
                    const diff = t.cogs ?? 0;
                    return diff > 0 ? acc + t.amount : acc;
                }, 0);
                const assetOtrosIngresos = assetAdjTxs.reduce((acc, t) => {
                    const diff = t.cogs ?? 0;
                    return diff < 0 ? acc + t.amount : acc;
                }, 0);

                const otrosIngresos = cashOtrosIngresos + assetOtrosIngresos;
                const otrosGastos = cashOtrosGastos + assetOtrosGastos;

                return {
                    ...baseAccounts,
                    ventas,
                    gastos,
                    costos: totalCostos,
                    otrosIngresos,
                    otrosGastos
                };
            },

            batchUpdateInventory: (updates: InventoryItem[]) => set((state) => {
                // Create a map for faster lookup
                const updateMap = new Map(updates.map(u => [u.id, u]));
                return {
                    inventory: state.inventory.map(item =>
                        updateMap.has(item.id) ? { ...item, ...updateMap.get(item.id) } : item
                    )
                };
            }),

            batchUpdateAssets: (updates: AssetItem[]) => set((state) => {
                const updateMap = new Map(updates.map(u => [u.id, u]));
                return {
                    assets: state.assets.map(item =>
                        updateMap.has(item.id) ? { ...item, ...updateMap.get(item.id) } : item
                    )
                };
            }),

            simulateInventoryFIFO: (itemId, qty) => {
                const state = get();
                const item = state.inventory.find(i => i.id === itemId);
                if (!item) return 0;

                let totalCost = 0;
                let remainingQty = qty;

                let batches = item.batches && item.batches.length > 0 ? [...item.batches] : [{
                    id: 'legacy-' + crypto.randomUUID(),
                    date: new Date(0).toISOString(),
                    cost: item.cost,
                    stock: item.stock
                }];

                batches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                for (const batch of batches) {
                    if (remainingQty <= 0) break;
                    if (batch.stock <= remainingQty) {
                        totalCost += batch.stock * batch.cost;
                        remainingQty -= batch.stock;
                    } else {
                        totalCost += remainingQty * batch.cost;
                        remainingQty = 0;
                    }
                }

                // Clamp phantom stock — same guard as consumeInventoryFIFO.
                if (remainingQty > 0) {
                    console.warn(
                        `simulateInventoryFIFO: requested ${qty} units of "${item.name}" ` +
                        `but only ${qty - remainingQty} were available. Clamped.`
                    );
                }

                return Number(totalCost.toFixed(2));
            },

            consumeInventoryFIFO: (itemId, qty) => {
                const state = get();
                const item = state.inventory.find(i => i.id === itemId);
                if (!item) return 0;

                let totalCost = 0;
                let remainingQty = qty;

                // Initialize legacy batch if no batches exist
                let batches = item.batches && item.batches.length > 0 ? [...item.batches] : [{
                    id: 'legacy-' + crypto.randomUUID(),
                    date: new Date(0).toISOString(), // oldest possible date to prioritize legacy stock
                    cost: item.cost,
                    stock: item.stock
                }];

                // Sort oldest first
                batches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                let newBatches = [];
                for (const batch of batches) {
                    if (remainingQty <= 0) {
                        newBatches.push(batch);
                        continue;
                    }

                    if (batch.stock <= remainingQty) {
                        // Consume full batch
                        totalCost += batch.stock * batch.cost;
                        remainingQty -= batch.stock;
                    } else {
                        // Consume partial batch
                        totalCost += remainingQty * batch.cost;
                        newBatches.push({
                            ...batch,
                            stock: batch.stock - remainingQty
                        });
                        remainingQty = 0;
                    }
                }

                // Guard: consuming more than available stock is a calling-code bug.
                // Log a warning and clamp — do NOT charge phantom cost for units that
                // don't exist, as that would silently corrupt COGS calculations.
                if (remainingQty > 0) {
                    console.warn(
                        `consumeInventoryFIFO: requested ${qty} units of "${item.name}" ` +
                        `but only ${qty - remainingQty} were available. ` +
                        `${remainingQty} phantom unit(s) clamped — check calling code.`
                    );
                }

                const newTotalStock = newBatches.reduce((sum, b) => sum + b.stock, 0);
                const newTotalValue = newBatches.reduce((sum, b) => sum + (b.stock * b.cost), 0);
                const newAvgCost = newTotalStock > 0 ? newTotalValue / newTotalStock : item.cost;

                set({
                    inventory: state.inventory.map(i =>
                        i.id === itemId ? {
                            ...i,
                            stock: newTotalStock,
                            cost: newAvgCost,
                            batches: newBatches
                        } : i
                    )
                });

                return Number(totalCost.toFixed(2));
            },

            revertTransaction: (txId: string) => {
                const state = get();
                const tx = state.transactions.find(t => t.id === txId);

                if (!tx || tx.status === 'VOIDED' || tx.type === 'INITIALIZATION') return;

                // Only banco and caja_chica are manually reversed here.
                // inventario, activo_fijo, and patrimonio are DERIVED — they are
                // recomputed at the end via reconcile() inside the final set().
                let newAccounts = { ...state.accounts };

                // ── Cash reversal helper ────────────────────────────────────────────
                const reverseCash = (method: string, amount: number, isInflowToCompany: boolean, splitAmounts?: {caja_chica: number, banco: number}) => {
                    if (method === 'split' && splitAmounts) {
                        if (isInflowToCompany) {
                            newAccounts['caja_chica'] -= splitAmounts.caja_chica;
                            newAccounts['banco'] -= splitAmounts.banco;
                        } else {
                            newAccounts['caja_chica'] += splitAmounts.caja_chica;
                            newAccounts['banco'] += splitAmounts.banco;
                        }
                        return;
                    }
                    if (!method) return;
                    const accName = method as 'caja_chica' | 'banco';
                    newAccounts[accName] += isInflowToCompany ? -amount : amount;
                };

                // ── Physical inventory FIFO restoration ─────────────────────────────
                // Adds a refund batch so FIFO order is preserved.
                // Does NOT touch newAccounts.inventario — reconcile() handles that.
                let updatedInventory = [...state.inventory];
                let assetIdToRemove: string | undefined;
                let assetItemsToRestore: any[] | undefined;

                const reverseInventoryFIFO = (itemId: string, qty: number, exactCostVal: number) => {
                    const idx = updatedInventory.findIndex(i => i.id === itemId);
                    if (idx === -1) return;
                    const item = updatedInventory[idx];
                    const refundCostPerUnit = exactCostVal > 0 ? exactCostVal / qty : item.cost;
                    const refundBatch = {
                        id: 'refund-' + crypto.randomUUID(),
                        date: tx.date,
                        cost: refundCostPerUnit,
                        stock: qty
                    };
                    const newBatches = [...(item.batches || []), refundBatch]
                        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                    const newTotalStock = item.stock + qty;
                    const newTotalValue = (item.stock * item.cost) + exactCostVal;
                    updatedInventory[idx] = {
                        ...item,
                        stock: newTotalStock,
                        cost: newTotalValue / newTotalStock,
                        batches: newBatches
                    };
                    // inventario is reconciled at the end — no manual update here
                };

                // ── Per-type reversal logic ─────────────────────────────────────────
                switch (tx.type) {
                    case 'SALE':
                        reverseCash(tx.details?.method, tx.amount, true, tx.details?.splitAmounts);
                        if (tx.details?.cart && (tx.cogs || 0) > 0) {
                            const totalQty = tx.details.cart.reduce((s: number, c: any) => s + c.qty, 0);
                            tx.details.cart.forEach((cartItem: any) => {
                                const proportion = cartItem.qty / totalQty;
                                reverseInventoryFIFO(cartItem.id, cartItem.qty, (tx.cogs || 0) * proportion);
                            });
                        }
                        // patrimonio reconciled automatically (cash up, inventory up → patrimonio recalculated)
                        break;

                    case 'PURCHASE':
                        reverseCash(tx.details?.method, tx.amount, false);
                        if (tx.details?.type === 'inventory') {
                            const relatedItem = updatedInventory.find(i =>
                                tx.details.itemId ? i.id === tx.details.itemId : i.name === tx.details.itemName
                            );
                            if (relatedItem) {
                                let newBatches = [...(relatedItem.batches || [])];
                                if (tx.details.batchId) {
                                    newBatches = newBatches.filter(b => b.id !== tx.details.batchId);
                                } else {
                                    // Legacy fallback: peel qty from newest batch (LIFO)
                                    let qtyToRemove = tx.details.quantity;
                                    const sorted = [...newBatches].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                                    newBatches = [];
                                    for (const batch of sorted) {
                                        if (qtyToRemove <= 0) { newBatches.push(batch); continue; }
                                        if (batch.stock <= qtyToRemove) { qtyToRemove -= batch.stock; }
                                        else { newBatches.push({ ...batch, stock: batch.stock - qtyToRemove }); qtyToRemove = 0; }
                                    }
                                }
                                const newTotalStock = newBatches.reduce((s, b) => s + b.stock, 0);
                                const newTotalValue = newBatches.reduce((s, b) => s + b.stock * b.cost, 0);
                                const newAvgCost = newTotalStock > 0 ? newTotalValue / newTotalStock : relatedItem.cost;
                                updatedInventory = updatedInventory.map(i =>
                                    (tx.details.itemId ? i.id === tx.details.itemId : i.name === tx.details.itemName)
                                        ? { ...i, stock: newTotalStock, cost: newAvgCost, batches: newBatches }
                                        : i
                                );
                                // inventario reconciled from updated physical array
                            }
                        } else if (tx.details?.type === 'asset') {
                            if (tx.details?.assetId) assetIdToRemove = tx.details.assetId;
                            // activo_fijo reconciled after asset is removed from catalog
                        }
                        break;

                    case 'EXPENSE':
                        reverseCash(tx.details?.method, tx.amount, false);
                        // patrimonio reconciled automatically (cash up → patrimonio up)
                        break;

                    case 'PRODUCTION': {
                        // Remove output stock from physical inventory.
                        // Guard: if the output was already partially consumed, clamp to 0 rather
                        // than letting stock go negative (which would silently corrupt the ledger).
                        if (tx.details?.outputName) {
                            updatedInventory = updatedInventory.map(i => {
                                if (!(tx.details.outputId ? i.id === tx.details.outputId : i.name === tx.details.outputName)) return i;
                                const newStock = i.stock - tx.details.outputQty;
                                if (newStock < 0) {
                                    console.warn(
                                        `revertTransaction PRODUCTION: output "${i.name}" stock is ${i.stock} ` +
                                        `but reversal needs to remove ${tx.details.outputQty}. Clamping to 0.`
                                    );
                                }
                                return { ...i, stock: Math.max(0, newStock) };
                            });
                        }
                        // Restore ingredient stock via FIFO refund batches
                        if (tx.details?.ingredients) {
                            const estimatedTotal = tx.details.ingredients.reduce((s: number, ing: any) =>
                                s + parseFloat(ing.qty) * ing.item.cost, 0
                            );
                            tx.details.ingredients.forEach((ing: any) => {
                                const proportion = estimatedTotal > 0
                                    ? (parseFloat(ing.qty) * ing.item.cost) / estimatedTotal
                                    : 1 / tx.details.ingredients.length;
                                reverseInventoryFIFO(ing.item.id, parseFloat(ing.qty), tx.amount * proportion);
                            });
                        }
                        // inventario reconciled from the net physical change (should be ~zero)
                        break;
                    }

                    case 'ADJUSTMENT': {
                        const cashAccount = tx.details?.account || tx.details?.method;
                        if (cashAccount === 'caja_chica' || cashAccount === 'banco') {
                            const numericDiff = cashAccount === 'caja_chica'
                                ? (tx.details?.diffCaja ?? NaN)
                                : (tx.details?.diffBanco ?? NaN);
                            const isLoss = !isNaN(numericDiff)
                                ? numericDiff > 0
                                : tx.description.includes('-');
                            reverseCash(cashAccount, tx.amount, !isLoss);
                            // patrimonio reconciled from cash change
                        }
                        if (tx.details?.itemsAdjusted !== undefined) {
                            // Physical stock restoration is omitted (FIFO complexity).
                            // inventario and patrimonio reconcile from the physical array
                            // which retains the post-adjustment stock levels.
                            // Net effect on balance sheet is zero after void.
                        }
                        if (tx.details?.diff !== undefined && tx.details?.itemsAdjusted === undefined) {
                            // Asset count void: restore catalog items to pre-adjustment values
                            if (tx.details?.itemDetails?.length > 0) {
                                assetItemsToRestore = tx.details.itemDetails.map((d: any) => ({
                                    id: d.id,
                                    value: d.sysVal,
                                }));
                            }
                            // activo_fijo and patrimonio reconciled after assets are restored
                        }
                        break;
                    }
                }

                // ── Mark voided + create audit contra-transaction ───────────────────
                const voidedTx = { ...tx, status: 'VOIDED' as const };
                const contraId = crypto.randomUUID();
                const contraTx = {
                    id: contraId,
                    type: 'ADJUSTMENT' as const,
                    date: new Date().toISOString(),
                    amount: tx.amount,
                    description: `[ANULACIÓN] Reversa de Transacción: ${tx.id.split('-')[0]}`,
                    voidingTxId: tx.id
                };
                voidedTx.voidingTxId = contraId;

                // ── Commit: physical changes + cash + reconcile derived fields ───────
                set(state => {
                    let updatedAssets = state.assets;
                    if (assetIdToRemove) {
                        updatedAssets = updatedAssets.filter(a => a.id !== assetIdToRemove);
                    } else if (assetItemsToRestore) {
                        const restoreMap = new Map(assetItemsToRestore.map((r: any) => [r.id, r.value]));
                        updatedAssets = updatedAssets.map(a =>
                            restoreMap.has(a.id) ? { ...a, value: restoreMap.get(a.id) } : a
                        );
                    }

                    // Reconcile: derive inventario, activo_fijo, patrimonio from physical arrays
                    const inventario = Number(updatedInventory.reduce((s, i) => s + i.stock * i.cost, 0).toFixed(2));
                    const activo_fijo = Number(updatedAssets.reduce((s, a) => s + a.value, 0).toFixed(2));
                    const patrimonio = Number(((newAccounts.banco || 0) + (newAccounts.caja_chica || 0) + inventario + activo_fijo).toFixed(2));

                    return {
                        accounts: { ...newAccounts, inventario, activo_fijo, patrimonio, _isLedger: true },
                        inventory: updatedInventory,
                        assets: updatedAssets,
                        transactions: [contraTx, ...state.transactions.map(t => t.id === txId ? voidedTx : t)]
                    };
                });
            },

            importState: (newState) => set(() => newState),
            reset: () => set(() => INITIAL_STATE),
        }),
        {
            name: 'jardin-erp-storage-v4',
            storage: createJSONStorage(() => cloudStorage),
            version: 13, // v13 = refactor: inventario/activo_fijo/patrimonio are derived fields
            migrate: (persistedState: any, version: number) => {
                let state = { ...persistedState };

                // --- MIGRATION PLAYBOOK ---
                console.log('Checking state migration from version:', version);

                // v1 → v2 (app v1.0.0 → v1.0.1): assets array added as root field
                if (version < 2) {
                    if (!state.assets) state.assets = [];
                }

                // v2 -> v3 (added locations array)
                if (version < 3) {
                    if (!state.locations) state.locations = [];
                }

                // v3 -> v4 (Retroactively generate Initial Onboarding transaction)
                if (version < 4) {
                    if (state.initialized && !state.transactions?.some((t: any) => t.details?.isInitialOnboarding)) {
                        const initialAssets = state.assets || [];
                        const assetValue = initialAssets.reduce((sum: number, a: any) => sum + (a.value || 0), 0);
                        
                        const initialInv = (state.inventory || []).map((i: any) => {
                            const originBatch = (i.batches && i.batches.length > 0) ? i.batches[0] : { stock: i.stock, cost: i.cost };
                            return { ...i, stock: originBatch.stock, cost: originBatch.cost };
                        }).filter((i: any) => i.stock > 0);
                        
                        const invValue = initialInv.reduce((sum: number, i: any) => sum + (i.cost * i.stock), 0);

                        let deducedCash = state.accounts?.caja_chica || 0;
                        let deducedBank = state.accounts?.banco || 0;
                        (state.transactions || []).forEach((tx: any) => {
                            if (tx.status === 'VOIDED') return;
                            const amt = tx.amount || 0;
                            const method = tx.details?.account || tx.details?.method;
                            
                            // Replay backwards
                            if (tx.type === 'SALE' || (tx.type === 'ADJUSTMENT' && tx.description.includes('+'))) {
                                if (method === 'caja_chica') deducedCash -= amt;
                                if (method === 'banco') deducedBank -= amt;
                            } else if (tx.type === 'PURCHASE' || tx.type === 'EXPENSE' || (tx.type === 'ADJUSTMENT' && tx.description.includes('-'))) {
                                if (method === 'caja_chica') deducedCash += amt;
                                if (method === 'banco') deducedBank += amt;
                            }
                            if (tx.type === 'INITIALIZATION' && !tx.details?.isInitialOnboarding) {
                                if (tx.description.toLowerCase().includes('caja chica')) deducedCash -= amt;
                                if (tx.description.toLowerCase().includes('banco')) deducedBank -= amt;
                            }
                        });

                        const retroactiveAporte = {
                            id: 'legacy-onboarding-' + Date.now(),
                            type: 'INITIALIZATION' as const,
                            date: state.transactions && state.transactions.length > 0 
                                ? new Date(new Date(state.transactions[state.transactions.length - 1].date).getTime() - 60000).toISOString()
                                : new Date().toISOString(),
                            amount: deducedCash + deducedBank + invValue + assetValue,
                            description: 'Aporte de Capital Inicial (Recuperado del Historial)',
                            details: {
                                isInitialOnboarding: true,
                                cash: deducedCash,
                                bank: deducedBank,
                                inventoryValue: invValue,
                                assetsValue: assetValue,
                                inventoryDetails: initialInv,
                                assetDetails: initialAssets
                            }
                        };
                        state.transactions = [retroactiveAporte, ...(state.transactions || [])];
                        state.transactions.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    }
                }

                // v4 -> v5 (Fix mathematically desynced inventario accumulator caused by reversion bugs)
                if (version < 5) {
                    if (state.accounts && state.inventory) {
                        const trueInvValue = state.inventory.reduce((sum: number, item: any) => sum + ((item.cost || 0) * (item.stock || 0)), 0);
                        state.accounts.inventario = trueInvValue;
                    }
                }

                // v5 -> v7 (Strict Forward Ledger Reconciliation for Cash and Bank)
                // Due to tab-sync race conditions, accounts object could drift from the immutable transaction ledger.
                // We calculate the exact mathematical state strictly from history.
                if (version < 7 && state.transactions) {
                    let trueCash = 0;
                    let trueBank = 0;
                    
                    (state.transactions || []).forEach((tx: any) => {
                        const amt = tx.amount || 0;
                        
                        let method = tx.details?.account || tx.details?.method;
                        if (!method && tx.voidingTxId) {
                            const orig = state.transactions.find((ot: any) => ot.id === tx.voidingTxId);
                            if (orig) method = orig.details?.account || orig.details?.method;
                        }
                        if (!method) {
                            const desc = (tx.description || '').toLowerCase();
                            if (desc.includes('banco') || desc.includes('transferencia')) method = 'banco';
                            if (desc.includes('caja chica') || desc.includes('efectivo') || desc.includes('caja')) method = 'caja_chica';
                        }
                        
                        if (tx.type === 'INITIALIZATION') {
                            // Initialization is an additive state definition
                            if (tx.details?.isInitialOnboarding) {
                                trueCash += (tx.details.cash || 0);
                                trueBank += (tx.details.bank || 0);
                            } else {
                                if (method === 'caja_chica' || (tx.description || '').toLowerCase().includes('caja chica')) trueCash += amt;
                                if (method === 'banco' || (tx.description || '').toLowerCase().includes('banco')) trueBank += amt;
                            }
                            return;
                        }

                        let isAdditive = false; 
                        let isSubtractive = false; 
                        
                        if (tx.type === 'SALE') isAdditive = true;
                        if (tx.type === 'PURCHASE' || tx.type === 'EXPENSE') isSubtractive = true;
                        
                        if (tx.type === 'ADJUSTMENT') {
                            if (tx.voidingTxId) {
                                const orig = state.transactions.find((ot: any) => ot.id === tx.voidingTxId);
                                if (orig) {
                                    if (orig.type === 'SALE') isSubtractive = true;
                                    if (orig.type === 'PURCHASE' || orig.type === 'EXPENSE') isAdditive = true; 
                                }
                            } else {
                                if ((tx.description || '').includes('+')) isAdditive = true;
                                if ((tx.description || '').includes('-')) isSubtractive = true;
                            }
                        }
                        
                        if (isAdditive) {
                            if (method === 'split' && tx.details?.splitAmounts) {
                                trueCash += (tx.details.splitAmounts.caja_chica || 0);
                                trueBank += (tx.details.splitAmounts.banco || 0);
                            } else {
                                if (method === 'caja_chica') trueCash += amt;
                                if (method === 'banco') trueBank += amt;
                            }
                        } else if (isSubtractive) {
                            if (method === 'split' && tx.details?.splitAmounts) {
                                trueCash -= (tx.details.splitAmounts.caja_chica || 0);
                                trueBank -= (tx.details.splitAmounts.banco || 0);
                            } else {
                                if (method === 'caja_chica') trueCash -= amt;
                                if (method === 'banco') trueBank -= amt;
                            }
                        }
                    });
                    
                    if (state.accounts) {
                        state.accounts.caja_chica = trueCash;
                        state.accounts.banco = trueBank;
                    }
                }

                // v7 -> v8: Reset patrimonio to match total assets.
                // Prior versions never updated patrimonio on expenses, sales, or adjustments,
                // causing equity to drift. v5 already corrected inventario and v7 corrected
                // banco/caja, so total assets are now the ground truth. Since this business
                // has no liabilities, Assets = Equity, and we set patrimonio accordingly.
                if (version < 8 && state.accounts) {
                    const { banco = 0, caja_chica = 0, inventario = 0, activo_fijo = 0 } = state.accounts;
                    state.accounts.patrimonio = banco + caja_chica + inventario + activo_fijo;
                }

                // v8 -> v9: Same reset — corrects patrimonio drift from SALE and EXPENSE reversals
                // that didn't update patrimonio (bug fixed in v1.0.3). Since this business has no
                // liabilities, Assets = Equity is always the ground truth.
                if (version < 9 && state.accounts) {
                    const { banco = 0, caja_chica = 0, inventario = 0, activo_fijo = 0 } = state.accounts;
                    state.accounts.patrimonio = banco + caja_chica + inventario + activo_fijo;
                }

                // v9 -> v10: Same reset — corrects patrimonio drift from asset count adjustments
                // (Toma de Activos Físicos) that updated activo_fijo but never patrimonio (bug fixed in v1.0.4).
                if (version < 10 && state.accounts) {
                    const { banco = 0, caja_chica = 0, inventario = 0, activo_fijo = 0 } = state.accounts;
                    state.accounts.patrimonio = banco + caja_chica + inventario + activo_fijo;
                }

                // v10 -> v11: Full clean reset.
                // Fixes: (1) purchase reversal now removes the exact FIFO batch via stored batchId;
                // (2) cash adjustment reversal now uses stored numeric diff instead of string parsing.
                // Old data is incompatible with the new batchId tracking, so we start fresh.
                if (version < 12) {
                    return { ...INITIAL_STATE } as any;
                }

                // v12 -> v13: inventario, activo_fijo, patrimonio are now derived fields.
                // Reconcile them from physical arrays so any stored drift is corrected on load.
                if (version < 13 && state.accounts && state.inventory && state.assets) {
                    const inventario = Number((state.inventory as any[]).reduce((s: number, i: any) => s + (i.stock || 0) * (i.cost || 0), 0).toFixed(2));
                    const activo_fijo = Number((state.assets as any[]).reduce((s: number, a: any) => s + (a.value || 0), 0).toFixed(2));
                    const patrimonio = Number(((state.accounts.banco || 0) + (state.accounts.caja_chica || 0) + inventario + activo_fijo).toFixed(2));
                    state.accounts = { ...state.accounts, inventario, activo_fijo, patrimonio };
                }

                return state as AppState & StoreActions;
            }
        }
    )
);
