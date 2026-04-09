import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Button, Card, cn } from './ui';
import { AccountingActions } from '../lib/accounting';
export const SystemAuditTest = () => {
    const [logs, setLogs] = useState<string[]>([]);
    const [isSuccess, setIsSuccess] = useState<boolean | null>(null);

    const log = (msg: string) => {
        setLogs(prev => [...prev, msg]);
    };

    const runAudit = () => {
        setLogs([]);
        setIsSuccess(null);
        log("Iniciando auditoría de sistema... Reseteando estado a valores de fábrica.");

        // We MUST reset state so legacy items don't throw off the exact asset calculations.
        useStore.getState().importState({
            initialized: true,
            accounts: { caja_chica: 0, banco: 0, inventario: 0, activo_fijo: 0, patrimonio: 0 },
            inventory: [],
            products: [
                { id: crypto.randomUUID(), name: "Pan Casero", price: 500 },
                { id: crypto.randomUUID(), name: "Café Negro", price: 1000 }
            ],
            providers: [
                { id: crypto.randomUUID(), name: "Proveedor Harina S.A." },
                { id: crypto.randomUUID(), name: "Granja Avícola" }
            ],
            expenseTypes: [
                { id: crypto.randomUUID(), name: "Agua y Luz" },
                { id: crypto.randomUUID(), name: "Planilla" }
            ],
            transactions: [],
            assets: []
        });

        const state = useStore.getState();

        log("1. Inyección de Capital Extra");
        state.updateAccounts(prev => ({
            ...prev,
            banco: prev.banco + 100000,
            caja_chica: prev.caja_chica + 50000,
            patrimonio: prev.patrimonio + 150000
        }));
        state.addTransaction({
            id: crypto.randomUUID(), type: 'INITIALIZATION', date: new Date().toISOString(), amount: 150000, description: "Aporte de Capital (Simulación)"
        });

        log("2. Comprando Artículo de Inventario (Harina x10 a ₡1000 c/u) pagado con Banco");
        let harina = state.inventory.find(i => i.name === "Harina");
        const harinaId = harina ? harina.id : crypto.randomUUID();
        const harinaBatch = { id: crypto.randomUUID(), date: new Date().toISOString(), stock: 10, cost: 1000 };
        if (harina) {
            const existingBatches = harina.batches && harina.batches.length > 0 ? [...harina.batches] : [{ id: 'legacy-harina', date: new Date(0).toISOString(), cost: harina.cost, stock: harina.stock }];
            state.updateInventoryItem(harinaId, {
                stock: harina.stock + 10,
                cost: (harina.cost * harina.stock + 10000) / (harina.stock + 10),
                batches: [...existingBatches, harinaBatch]
            });
        } else {
            state.addInventoryItem({ id: harinaId, name: "Harina", cost: 1000, stock: 10, batches: [harinaBatch] });
        }
        state.updateAccounts(prev => AccountingActions.purchaseInventory(prev, 10000, 'banco'));
        state.addTransaction({ id: crypto.randomUUID(), type: 'PURCHASE', date: new Date().toISOString(), amount: 10000, description: "Compra Inventario: Harina (x10)", details: { itemName: "Harina", quantity: 10, method: "banco", type: "inventory", providerName: "Proveedor Harina S.A." } });

        log("3. Comprando Activo Fijo (Batidora ₡20,000) pagado con Caja Chica");
        state.addAssetItem({ id: crypto.randomUUID(), name: "Batidora", value: 20000, quantity: 1 });
        state.updateAccounts(prev => AccountingActions.purchaseAsset(prev, 20000, 'caja_chica'));
        state.addTransaction({ id: crypto.randomUUID(), type: 'PURCHASE', date: new Date().toISOString(), amount: 20000, description: "Compra Activo: Batidora (x1)", details: { itemName: "Batidora", quantity: 1, method: "caja_chica", type: "asset" } });

        log("4. Venta Simple (Servicio / Café ₡3000) a Caja Chica");
        state.updateAccounts(prev => AccountingActions.registerSale(prev, 3000, 0, false, 'caja_chica'));
        state.addTransaction({ id: crypto.randomUUID(), type: 'SALE', date: new Date().toISOString(), amount: 3000, description: "Venta: Café (x2)", details: { method: "caja_chica", cart: [{ name: "Café", qty: 2, price: 1500 }] } });

        log("5. Producción (Cocinar 10 Panes consumiendo 2 Harinas)");
        let costHarinaConsumed = state.consumeInventoryFIFO(harinaId, 2);

        let pan = state.inventory.find(i => i.name === "Pan");
        const panId = pan ? pan.id : crypto.randomUUID();
        const unitCostPan = costHarinaConsumed / 10;
        const panBatch = { id: crypto.randomUUID(), date: new Date().toISOString(), stock: 10, cost: unitCostPan };
        if (pan) {
            const existingBatches = pan.batches && pan.batches.length > 0 ? [...pan.batches] : [{ id: 'legacy-pan', date: new Date(0).toISOString(), cost: pan.cost, stock: pan.stock }];
            const newStock = pan.stock + 10;
            const newTotalVal = (pan.cost * pan.stock) + costHarinaConsumed;
            state.updateInventoryItem(panId, {
                stock: newStock,
                cost: newStock > 0 ? newTotalVal / newStock : 0,
                batches: [...existingBatches, panBatch]
            });
        } else {
            state.addInventoryItem({ id: panId, name: "Pan", stock: 10, cost: unitCostPan, batches: [panBatch] });
        }
        state.updateAccounts(prev => AccountingActions.production(prev));
        state.addTransaction({ id: crypto.randomUUID(), type: 'PRODUCTION', date: new Date().toISOString(), amount: costHarinaConsumed, description: "Cocina: 10x Pan (usando 2x Harina)", cogs: costHarinaConsumed, details: { outputName: "Pan", outputQty: 10, ingredients: [{ item: { id: harinaId, name: "Harina", cost: costHarinaConsumed / 2 }, qty: 2 }] } });

        log("6. Venta Compleja (Vender 5 Panes a ₡500 c/u) a Banco");
        // Inventario NO se deduce en la venta (Periodic Inventory Model)
        state.updateAccounts(prev => AccountingActions.registerSale(prev, 2500, 0, false, 'banco'));
        state.addTransaction({ id: crypto.randomUUID(), type: 'SALE', date: new Date().toISOString(), amount: 2500, description: "Venta: Pan (x5)", cogs: 0, details: { method: "banco", cart: [{ name: "Pan", qty: 5, price: 500 }] } });

        log("7. Registrar Gasto (Luz ₡5000) desde Banco");
        state.updateAccounts(prev => AccountingActions.payExpense(prev, 5000, 'banco'));
        state.addTransaction({ id: crypto.randomUUID(), type: 'EXPENSE', date: new Date().toISOString(), amount: 5000, description: "Gasto (Luz)", details: { typeName: "Luz", provName: "CNFL", method: "banco" } });

        log("8. Ingrese Nuevos Activos y Nuevos Inventarios");
        // Nuevo Activo: Silla 5,000 de Caja Chica
        state.addAssetItem({ id: crypto.randomUUID(), name: "Sillas Extras", value: 5000, quantity: 4 });
        state.updateAccounts(prev => AccountingActions.purchaseAsset(prev, 5000, 'caja_chica'));
        state.addTransaction({ id: crypto.randomUUID(), type: 'PURCHASE', date: new Date().toISOString(), amount: 5000, description: "Compra Activo: Sillas Extras", details: { itemName: "Sillas Extras", quantity: 4, method: "caja_chica", type: "asset" } });

        // Nuevo Inventario: Huevos 3,000 de Banco
        let huevos = state.inventory.find(i => i.name === "Huevos");
        const huevosId = huevos ? huevos.id : crypto.randomUUID();
        const huevosBatch = { id: crypto.randomUUID(), date: new Date().toISOString(), stock: 30, cost: 100 };

        if (huevos) {
            const existingBatches = huevos.batches && huevos.batches.length > 0 ? [...huevos.batches] : [{ id: 'legacy-huevos', date: new Date(0).toISOString(), cost: huevos.cost, stock: huevos.stock }];
            state.updateInventoryItem(huevosId, {
                stock: huevos.stock + 30,
                cost: (huevos.cost * huevos.stock + 3000) / (huevos.stock + 30),
                batches: [...existingBatches, huevosBatch]
            });
        } else {
            state.addInventoryItem({ id: huevosId, name: "Huevos", cost: 100, stock: 30, batches: [huevosBatch] });
        }

        state.updateAccounts(prev => AccountingActions.purchaseInventory(prev, 3000, 'banco'));
        state.addTransaction({ id: crypto.randomUUID(), type: 'PURCHASE', date: new Date().toISOString(), amount: 3000, description: "Compra Inventario: Huevos (x30)", details: { itemName: "Huevos", quantity: 30, method: "banco", type: "inventory", providerName: "Granja Avícola" } });

        log("9. Venta con Precio Modificado (1 Pan a ₡400) a Caja Chica");
        state.updateAccounts(prev => AccountingActions.registerSale(prev, 400, 0, false, 'caja_chica'));
        state.addTransaction({
            id: crypto.randomUUID(),
            type: 'SALE',
            date: new Date().toISOString(),
            amount: 400,
            description: "Venta: Pan (Precio Modificado)",
            cogs: 0,
            details: {
                method: 'caja_chica',
                cart: [{
                    id: panId,
                    name: "Pan",
                    qty: 1,
                    price: 400
                }]
            }
        });

        log("10. Ajuste de Inventario Físico (Costo de Venta por Toma Física)");
        let totalPerdida = 0;
        // Al final de la semana, se cuentan los faltantes y se envían a Costos (Mermas/Consumo)
        totalPerdida += state.consumeInventoryFIFO(harinaId, 1);
        totalPerdida += state.consumeInventoryFIFO(panId, 6); // Ajustamos los 6 panes que se vendieron durante la simulación!
        totalPerdida += state.consumeInventoryFIFO(huevosId, 2);

        state.updateAccounts(prev => AccountingActions.adjustInventoryValues(prev, totalPerdida));
        state.addTransaction({ id: crypto.randomUUID(), type: 'ADJUSTMENT', date: new Date().toISOString(), amount: totalPerdida, description: "Ajuste Físico (Mermas)", cogs: totalPerdida });

        log("--- Simulación Completada. Iniciando Auditoría ---");

        // Grab final state
        const finalState = useStore.getState();
        const baseAcc = finalState.accounts;
        const ledger = finalState.getLedgerAccounts();

        const totalAssets = baseAcc.banco + baseAcc.caja_chica + baseAcc.inventario + baseAcc.activo_fijo;
        const netIncome = (ledger.ventas || 0) - (ledger.costos || 0) - (ledger.gastos || 0);
        // Accounting Equation: Assets = Liabilities + Equity + retained earnings (Net Income)
        const liabilitiesEquity = baseAcc.patrimonio + netIncome;

        log(`Resultados Cuenta: Banco(₡${baseAcc.banco}), Caja(₡${baseAcc.caja_chica}), Inv(₡${baseAcc.inventario}), Activo(₡${baseAcc.activo_fijo})`);
        log(`Ingresos: Ventas(₡${ledger.ventas || 0}) | Egresos: Costos(₡${ledger.costos || 0}), Gastos(₡${ledger.gastos || 0})`);

        console.log("=== PRE-VOID BALANCE CHECK ===");
        console.log("Assets:", { banco: baseAcc.banco, caja_chica: baseAcc.caja_chica, inventario: baseAcc.inventario, activo_fijo: baseAcc.activo_fijo, total: totalAssets });
        console.log("Liabilities+Equity:", { patrimonio: baseAcc.patrimonio, ventas: ledger.ventas, costos: ledger.costos, gastos: ledger.gastos, netIncome: netIncome, total: liabilitiesEquity });
        console.log("Difference:", totalAssets - liabilitiesEquity);

        let passed = true;
        // Calculate diff with small epsilon for JS float physics
        if (Math.abs(totalAssets - liabilitiesEquity) > 0.01) {
            log(`❌ ERROR CONTABLE: Activos (₡${totalAssets}) != Pasivo+Patrimonio (₡${liabilitiesEquity})`);
            passed = false;
        } else {
            log(`✅ ECUACIÓN CONTABLE PERFECTA: Activos (₡${totalAssets}) == Pasivo+Patrimonio (₡${liabilitiesEquity})`);
        }

        log("11. Prueba de Anulación de Transacción (Reversión)");
        // Find the last sale and revert it
        const lastSale = finalState.transactions.find(t => t.type === 'SALE');
        if (lastSale) {
            finalState.revertTransaction(lastSale.id);
            const revertedState = useStore.getState();
            const voidedTx = revertedState.transactions.find(t => t.id === lastSale.id);
            // The contra transaction should be the first one added after the void,
            // assuming no other transactions happened immediately after the void.
            // A more robust check might involve filtering by date or a specific property.
            const contraTx = revertedState.transactions.find(t => t.voidingTxId === lastSale.id);

            if (voidedTx?.status === 'VOIDED' && contraTx) { // Check if contraTx exists
                log("✅ Transacción Anulada y Contra-Asiento Generado.");

                // Final Ledger Check after Void
                const postVoidLedger = revertedState.getLedgerAccounts();
                const postVoidAssets = revertedState.accounts.banco + revertedState.accounts.caja_chica + revertedState.accounts.inventario + revertedState.accounts.activo_fijo;
                const postVoidNet = (postVoidLedger.ventas || 0) - (postVoidLedger.costos || 0) - (postVoidLedger.gastos || 0);

                console.log("=== POST-VOID BALANCE CHECK ===");
                console.log("Assets:", { banco: revertedState.accounts.banco, caja_chica: revertedState.accounts.caja_chica, inventario: revertedState.accounts.inventario, activo_fijo: revertedState.accounts.activo_fijo, total: postVoidAssets });
                console.log("Liabilities+Equity:", { patrimonio: revertedState.accounts.patrimonio, ventas: postVoidLedger.ventas, costos: postVoidLedger.costos, gastos: postVoidLedger.gastos, netIncome: postVoidNet, total: revertedState.accounts.patrimonio + postVoidNet });
                console.log("Difference:", postVoidAssets - (revertedState.accounts.patrimonio + postVoidNet));

                if (Math.abs(postVoidAssets - (revertedState.accounts.patrimonio + postVoidNet)) < 0.01) {
                    log("✅ Ecuación Contable se mantiene post-anulación.");
                } else {
                    log(`❌ Descuadre post-anulación. Activos: ${postVoidAssets}, Pasivo+Pat: ${revertedState.accounts.patrimonio + postVoidNet}`);
                    passed = false;
                }
            } else {
                log("❌ Error en la Reversión de la Transacción.");
                passed = false;
            }
        } else {
            log("⚠️ No se encontró una transacción de venta para anular.");
        }

        setIsSuccess(passed);

        if (passed) {
            log("🎉 Auditoría superada con éxito. Todos los sistemas operativos.");
        } else {
            log("🔥 Falló la auditoría del sistema.");
        }
    };

    return (
        <Card className={cn(
            "max-w-xl mx-auto space-y-4 border-2 bg-emerald-50",
            isSuccess === true ? "border-green-500 bg-green-50 text-green-900" :
                isSuccess === false ? "border-red-500 bg-red-50" :
                    "border-emerald-200"
        )}>
            <div>
                <h3 className="font-bold text-lg mb-2">Simulación y Auditoría del Sistema</h3>
                <p className="text-sm opacity-80 mb-4">
                    Esta función reemplazará los datos actuales con una simulación completa (Compras, Ventas, Gastos, Producción) para verificar la integridad contable del sistema.
                </p>
                <Button onClick={runAudit} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                    Ejecutar Simulación Contable
                </Button>
            </div>
            {logs.length > 0 && (
                <div className="bg-black text-emerald-400 p-4 rounded-xl font-mono text-xs space-y-1 h-64 overflow-y-auto">
                    {logs.map((l, i) => (
                        <div key={i} className={cn(l.includes('❌') ? 'text-red-400 font-bold' : l.includes('✅') || l.includes('🎉') ? 'text-green-400 font-bold' : '')}>
                            {l}
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
};
