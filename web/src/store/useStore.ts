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
                const otrosIngresos = validTxs
                    .filter(t => t.type === 'ADJUSTMENT' && !t.voidingTxId && !t.description.toLowerCase().includes('inventario') && !t.description.toLowerCase().includes('físico') && !t.description.toLowerCase().includes('activos'))
                    .reduce((acc, t) => {
                        if (t.description.includes('+')) return acc + t.amount;
                        return acc;
                    }, 0);

                let gastos = validTxs.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + t.amount, 0);
                const otrosGastos = validTxs
                    .filter(t => t.type === 'ADJUSTMENT' && !t.voidingTxId && !t.description.toLowerCase().includes('inventario') && !t.description.toLowerCase().includes('físico') && !t.description.toLowerCase().includes('activos'))
                    .reduce((acc, t) => {
                        if (t.description.includes('+')) return acc; // Gain
                        return acc + t.amount;
                    }, 0);

                const salesCogs = validTxs.filter(t => t.type === 'SALE').reduce((acc, t) => acc + (t.cogs || 0), 0);
                const costsFromAdj = validTxs
                    .filter(t => t.type === 'ADJUSTMENT' && !t.voidingTxId && (t.description.toLowerCase().includes('inventario') || t.description.toLowerCase().includes('físico') || t.description.toLowerCase().includes('activos')))
                    .reduce((acc, t) => acc + (t.cogs !== undefined ? t.cogs : t.amount), 0);

                const totalCostos = salesCogs + costsFromAdj;

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

                if (remainingQty > 0) {
                    totalCost += remainingQty * item.cost;
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

                // If asking for more stock than we have, the rest technically costs the average price of the last known batch
                if (remainingQty > 0) {
                    totalCost += remainingQty * item.cost;
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

                // 1. Revert Accounts (Liquidity only, Ledger handles Income Statement)
                let newAccounts = { ...state.accounts };

                // Helper to reverse liquid cash movement
                const reverseCash = (method: string, amount: number, isInflowToCompany: boolean) => {
                    if (!method) return;
                    const accName = method as 'caja_chica' | 'banco';
                    if (isInflowToCompany) {
                        newAccounts[accName] -= amount; // We got money, now taking it back
                    } else {
                        newAccounts[accName] += amount; // We spent money, now getting it back
                    }
                };

                // Helper to re-inject stock into FIFO
                let updatedInventory = [...state.inventory];
                const reverseInventoryFIFO = (itemId: string, qty: number, exactCostVal: number) => {
                    const idx = updatedInventory.findIndex(i => i.id === itemId);
                    if (idx === -1) return;

                    const item = updatedInventory[idx];
                    const refundCostPerUnit = exactCostVal > 0 ? exactCostVal / qty : item.cost;

                    const refundBatch = {
                        id: 'refund-' + crypto.randomUUID(),
                        date: tx.date, // Put it back at the exact point in time it left
                        cost: refundCostPerUnit,
                        stock: qty
                    };

                    const newBatches = [...(item.batches || []), refundBatch].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                    const newTotalStock = item.stock + qty;
                    const newTotalValue = (item.stock * item.cost) + exactCostVal;

                    updatedInventory[idx] = {
                        ...item,
                        stock: newTotalStock,
                        cost: newTotalValue / newTotalStock,
                        batches: newBatches
                    };

                    // Re-inject the financial value back into the Asset account accumulator
                    newAccounts.inventario = (newAccounts.inventario || 0) + exactCostVal;
                };

                switch (tx.type) {
                    case 'SALE':
                        reverseCash(tx.details?.method, tx.amount, true);
                        if (tx.details?.cart) {
                            // Reverse FIFO for each item sold
                            // To ensure perfect accounting equation symmetry, the exact COGS that left the balance sheet MUST return.
                            let reInjectedValue = 0;
                            const totalQty = tx.details.cart.reduce((sum: number, c: any) => sum + c.qty, 0);

                            tx.details.cart.forEach((cartItem: any) => {
                                // Distribute the original total cogs across items based on quantity proportion
                                const proportion = cartItem.qty / totalQty;
                                const itemCogsShare = (tx.cogs || 0) * proportion;
                                reInjectedValue += itemCogsShare;
                                reverseInventoryFIFO(cartItem.id, cartItem.qty, itemCogsShare);
                            });

                            // Accounts 'inventario' is technically dynamically computed as sum of stock * cost
                            // reverseInventoryFIFO naturally bumps this value up.
                        }
                        break;
                    case 'PURCHASE':
                        reverseCash(tx.details?.method, tx.amount, false);
                        // If it was Inventory, we must REMOVE the batch we added. (Simplification: Just deduct stock via FIFO)
                        if (tx.details?.type === 'inventory') {
                            const relatedItem = updatedInventory.find(i => i.name === tx.details.itemName);
                            if (relatedItem) {
                                const qtyToRemove = tx.details.quantity;
                                const newStock = relatedItem.stock - qtyToRemove;
                                
                                // Reduce the physical stock
                                updatedInventory = updatedInventory.map(i => i.name === relatedItem.name ? { ...i, stock: newStock } : i);
                                
                                // Fix missing reduction in Accounting Value
                                newAccounts.inventario -= tx.amount;
                            }
                        } else if (tx.details?.type === 'asset') {
                            newAccounts.activo_fijo -= tx.amount;
                        }
                        break;
                    case 'EXPENSE':
                        reverseCash(tx.details?.method, tx.amount, false);
                        break;
                    case 'PRODUCTION':
                        // Reverse Output
                        if (tx.details?.outputName) {
                            const outputCost = updatedInventory.find(i => i.name === tx.details.outputName)?.cost || 0;
                            updatedInventory = updatedInventory.map(i => i.name === tx.details.outputName ? { ...i, stock: i.stock - tx.details.outputQty } : i);
                            newAccounts.inventario -= (outputCost * tx.details.outputQty);
                        }
                        // Refund Ingredients
                        if (tx.details?.ingredients) {
                            tx.details.ingredients.forEach((ing: any) => {
                                reverseInventoryFIFO(ing.item.id, parseFloat(ing.qty), ing.qty * ing.item.cost);
                            });
                        }
                        break;
                    case 'ADJUSTMENT':
                        if (tx.details?.account) {
                            // It was a cash adjust
                            const isLoss = tx.description.includes('-');
                            reverseCash(tx.details.account, tx.amount, !isLoss);
                        }
                        if (tx.details?.itemsAdjusted !== undefined) {
                            // It was an inventory adjust. Reversing a shrinkage means re-adding the lost items.
                            // Simplification: We don't natively refund physical adjustments yet to avoid extreme complexity in batch dates.
                        }
                        break;
                }

                // 2. Mark Original as Voided
                const voidedTx = { ...tx, status: 'VOIDED' as const };

                // 3. Create Contra-Transaction for Audit Trail
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

                set(state => ({
                    accounts: { ...newAccounts, _isLedger: true },
                    inventory: updatedInventory,
                    transactions: [contraTx, ...state.transactions.map(t => t.id === txId ? voidedTx : t)]
                }));
            },

            importState: (newState) => set(() => newState),
            reset: () => set(() => INITIAL_STATE),
        }),
        {
            name: 'jardin-erp-storage-v4',
            storage: createJSONStorage(() => cloudStorage),
            version: 6, // v6 = fix method-less adjustment deductions in initialization
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

                // v5 -> v6 (Strict Forward Ledger Reconciliation for Cash and Bank)
                // Due to tab-sync race conditions, accounts object could drift from the immutable transaction ledger.
                // We calculate the exact mathematical state strictly from history.
                if (version < 6 && state.transactions) {
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
                            if (method === 'caja_chica') trueCash += amt;
                            if (method === 'banco') trueBank += amt;
                        } else if (isSubtractive) {
                            if (method === 'caja_chica') trueCash -= amt;
                            if (method === 'banco') trueBank -= amt;
                        }
                    });
                    
                    if (state.accounts) {
                        state.accounts.caja_chica = trueCash;
                        state.accounts.banco = trueBank;
                    }
                }

                // Example for future:
                // if (version < 3) {
                //     state.inventory = state.inventory.map((item: any) => ({ ...item, newRequiredField: false }));
                // }

                return state as AppState & StoreActions;
            }
        }
    )
);
