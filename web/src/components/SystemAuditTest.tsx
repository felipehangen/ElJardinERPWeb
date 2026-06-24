import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Button, Card, cn } from './ui';
import { AccountingActions } from '../lib/accounting';
import { INITIAL_STATE } from '../types';

type LogEntry = { msg: string; kind: 'step' | 'ok' | 'fail' | 'info' };

const snap = () => {
    const s = useStore.getState();
    const { banco = 0, caja_chica = 0, inventario = 0, activo_fijo = 0, patrimonio = 0 } = s.accounts;
    return { banco, caja_chica, inventario, activo_fijo, patrimonio, total: banco + caja_chica + inventario + activo_fijo };
};

export const SystemAuditTest = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [summary, setSummary] = useState<{ passed: number; failed: number } | null>(null);

    const runAudit = () => {
        const entries: LogEntry[] = [];
        let passed = 0, failed = 0;

        const log = (msg: string, kind: LogEntry['kind'] = 'info') => entries.push({ msg, kind });
        const ok  = (label: string, detail = '') => { log(`✅ ${label}${detail ? '  →  ' + detail : ''}`, 'ok');   passed++; };
        const fail= (label: string, detail = '') => { log(`❌ ${label}${detail ? '  →  ' + detail : ''}`, 'fail'); failed++; };
        const step= (n: number, title: string)   => log(`── [${n}] ${title}`, 'step');

        const checkEq = (label: string) => {
            const { patrimonio, total } = snap();
            const diff = Math.abs(total - patrimonio);
            if (diff < 0.02) ok(`Assets = Equity  [${label}]`, `₡${total.toFixed(0)} = ₡${patrimonio.toFixed(0)}`);
            else fail(`Assets ≠ Equity  [${label}]`,
                `Assets ₡${total.toFixed(0)} | Patrimonio ₡${patrimonio.toFixed(0)} | Diff ₡${diff.toFixed(2)}`);
        };

        // Check accounts returned to a snapshot after a reversal
        const checkRevert = (label: string, before: ReturnType<typeof snap>) => {
            const after = snap();
            const keys = ['banco', 'caja_chica', 'inventario', 'activo_fijo', 'patrimonio'] as const;
            let allMatch = true;
            for (const k of keys) {
                if (Math.abs(before[k] - after[k]) > 0.02) {
                    fail(`Reversal restored ${k}  [${label}]`,
                        `expected ₡${before[k].toFixed(0)}, got ₡${after[k].toFixed(0)}`);
                    allMatch = false;
                }
            }
            if (allMatch) ok(`Reversal restored all accounts  [${label}]`);
            checkEq(`post-void ${label}`);
        };

        // ── Reset ────────────────────────────────────────────────────────────
        log('══════════════════════════════════════════════', 'step');
        log('  EL JARDIN ERP — Simulación Contable v1.0.7 ', 'step');
        log('══════════════════════════════════════════════', 'step');
        step(0, 'Reset a estado limpio');
        useStore.getState().importState({ ...INITIAL_STATE, initialized: true });
        checkEq('estado inicial');

        // ════════════════════════════════════════════════════════════════════
        log('', 'info');
        log('▶ FASE 1 — Transacciones activas (se mantienen al finalizar)', 'step');
        log('  Resultados Acumulados serán visibles en Paso a Paso', 'info');
        log('', 'info');

        // Item IDs reused across steps
        const harinaId = crypto.randomUUID();
        const panId    = crypto.randomUUID();

        // ── 1. Capital injection ─────────────────────────────────────────────
        step(1, 'Capital inicial: banco ₡100k + caja ₡50k');
        useStore.getState().updateAccounts(prev => ({
            ...prev,
            banco: prev.banco + 100000,
            caja_chica: prev.caja_chica + 50000,
            // patrimonio derived by reconcile()
        }));
        useStore.getState().reconcile();
        useStore.getState().addTransaction({
            id: crypto.randomUUID(), type: 'INITIALIZATION', date: new Date().toISOString(), amount: 150000,
            description: 'Aporte de Capital (Simulación)',
            details: { isInitialOnboarding: true, cash: 50000, bank: 100000, inventoryValue: 0, assetsValue: 0 },
        });
        checkEq('post-capital');

        // ── 2. Purchase inventory ────────────────────────────────────────────
        step(2, 'Compra Inventario: Harina x10 @₡1,000 (banco)');
        {
            const batch = { id: crypto.randomUUID(), date: new Date().toISOString(), stock: 10, cost: 1000 };
            useStore.getState().addInventoryItem({ id: harinaId, name: 'Harina', cost: 1000, stock: 10, batches: [batch] });
            useStore.getState().updateAccounts(prev => AccountingActions.purchaseInventory(prev, 10000, 'banco'));
            useStore.getState().reconcile();
            useStore.getState().addTransaction({
                id: crypto.randomUUID(), type: 'PURCHASE', date: new Date().toISOString(), amount: 10000,
                description: 'Compra Inventario: Harina (x10)',
                details: { itemId: harinaId, itemName: 'Harina', batchId: batch.id, quantity: 10, method: 'banco', type: 'inventory' },
            });
        }
        checkEq('post-compra-harina');

        // ── 3. Purchase asset ────────────────────────────────────────────────
        step(3, 'Compra Activo Fijo: Batidora ₡20,000 (caja chica)');
        {
            const batidoraId = crypto.randomUUID();
            useStore.getState().addAssetItem({ id: batidoraId, name: 'Batidora', value: 20000, quantity: 1 });
            useStore.getState().updateAccounts(prev => AccountingActions.purchaseAsset(prev, 20000, 'caja_chica'));
            useStore.getState().reconcile();
            useStore.getState().addTransaction({
                id: crypto.randomUUID(), type: 'PURCHASE', date: new Date().toISOString(), amount: 20000,
                description: 'Compra Activo: Batidora (x1)',
                details: { assetId: batidoraId, itemName: 'Batidora', quantity: 1, method: 'caja_chica', type: 'asset' },
            });
        }
        checkEq('post-compra-batidora');

        // ── 4. Sale (service) ────────────────────────────────────────────────
        step(4, 'Venta: Café x2 @₡1,500 = ₡3,000 (caja chica)');
        {
            useStore.getState().updateAccounts(prev => AccountingActions.registerSale(prev, 3000, 'caja_chica'));
            useStore.getState().reconcile();
            useStore.getState().addTransaction({
                id: crypto.randomUUID(), type: 'SALE', date: new Date().toISOString(), amount: 3000,
                description: 'Venta: Café (x2)', cogs: 0,
                details: { method: 'caja_chica', cart: [{ id: 'cafe', name: 'Café', qty: 2, price: 1500 }] },
            });
        }
        checkEq('post-venta');

        // ── 5. Expense ───────────────────────────────────────────────────────
        step(5, 'Gasto: Luz ₡5,000 (banco)');
        {
            useStore.getState().updateAccounts(prev => AccountingActions.payExpense(prev, 5000, 'banco'));
            useStore.getState().reconcile();
            useStore.getState().addTransaction({
                id: crypto.randomUUID(), type: 'EXPENSE', date: new Date().toISOString(), amount: 5000,
                description: 'Gasto (Luz)', details: { typeName: 'Luz', method: 'banco' },
            });
        }
        checkEq('post-gasto');

        // ── 6. Production ────────────────────────────────────────────────────
        step(6, 'Producción: 2x Harina → 10x Pan');
        {
            const cogs = useStore.getState().consumeInventoryFIFO(harinaId, 2);
            const panBatch = { id: crypto.randomUUID(), date: new Date().toISOString(), stock: 10, cost: cogs / 10 };
            useStore.getState().addInventoryItem({ id: panId, name: 'Pan', cost: cogs / 10, stock: 10, batches: [panBatch] });
            useStore.getState().updateAccounts(prev => AccountingActions.production(prev));
            useStore.getState().reconcile();
            useStore.getState().addTransaction({
                id: crypto.randomUUID(), type: 'PRODUCTION', date: new Date().toISOString(),
                amount: cogs, description: 'Cocina: 10x Pan (2x Harina)', cogs,
                details: { outputId: panId, outputName: 'Pan', outputQty: 10, ingredients: [{ item: { id: harinaId, name: 'Harina', cost: 1000 }, qty: 2 }] },
            });
        }
        checkEq('post-producción');

        // ── 7. Cash adjustment — loss ────────────────────────────────────────
        step(7, 'Ajuste Caja Chica: faltante ₡1,000');
        {
            const s = snap();
            const diffCaja = 1000; // system > real → loss
            useStore.getState().updateAccounts(prev => AccountingActions.auditCash(prev, s.caja_chica, s.caja_chica - diffCaja, 'caja_chica'));
            useStore.getState().reconcile();
            useStore.getState().addTransaction({
                id: crypto.randomUUID(), type: 'ADJUSTMENT', date: new Date().toISOString(),
                amount: diffCaja, description: `Ajuste Caja Chica (Dif: -₡${diffCaja})`,
                details: { method: 'caja_chica', diffCaja },
            });
        }
        checkEq('post-ajuste-caja');

        // ── 8. Cash adjustment — gain ────────────────────────────────────────
        step(8, 'Ajuste Bancos: sobrante ₡500');
        {
            const s = snap();
            const diffBanco = -500; // system < real → gain
            useStore.getState().updateAccounts(prev => AccountingActions.auditCash(prev, s.banco, s.banco - diffBanco, 'banco'));
            useStore.getState().reconcile();
            useStore.getState().addTransaction({
                id: crypto.randomUUID(), type: 'ADJUSTMENT', date: new Date().toISOString(),
                amount: 500, description: `Ajuste Bancos (Dif: +₡500)`,
                details: { method: 'banco', diffBanco },
            });
        }
        checkEq('post-ajuste-banco');

        // ── 9. Inventory count ───────────────────────────────────────────────
        step(9, 'Toma Física: 3x Pan faltante');
        {
            const lost = useStore.getState().consumeInventoryFIFO(panId, 3);
            useStore.getState().reconcile();
            useStore.getState().addTransaction({
                id: crypto.randomUUID(), type: 'ADJUSTMENT', date: new Date().toISOString(),
                amount: lost, description: 'Ajuste Físico Inventario (Merma)', cogs: lost,
                details: { itemsAdjusted: [{ name: 'Pan', qty: 3 }] },
            });
        }
        checkEq('post-toma-inventario');

        // ── 10. Asset count ──────────────────────────────────────────────────
        step(10, 'Toma Activos: Batidora vale ₡2,000 menos');
        {
            const diff = 2000;
            const batidora = useStore.getState().assets.find(a => a.name === 'Batidora');
            if (batidora) {
                const newVal = batidora.value - diff;
                useStore.getState().updateAssetItem(batidora.id, { value: newVal });
                useStore.getState().reconcile();
                useStore.getState().addTransaction({
                    id: crypto.randomUUID(), type: 'ADJUSTMENT', date: new Date().toISOString(),
                    amount: diff, description: 'Ajuste de Activos (Dif: -₡2000)', cogs: diff,
                    details: { diff, counts: {}, itemDetails: [{ id: batidora.id, name: batidora.name, sysVal: batidora.value, realVal: newVal }] },
                });
            } else {
                fail('Batidora not found for asset count test');
            }
        }
        checkEq('post-toma-activos');

        // Log P&L summary after Phase 1
        log('', 'info');
        {
            const ledger = useStore.getState().getLedgerAccounts();
            log(`   Ventas: ₡${ledger.ventas?.toFixed(0)}  |  Gastos: ₡${ledger.gastos?.toFixed(0)}  |  Utilidad: ₡${((ledger.ventas||0)-(ledger.gastos||0)-(ledger.costos||0)).toFixed(0)}`, 'info');
        }

        // ════════════════════════════════════════════════════════════════════
        log('', 'info');
        log('▶ FASE 2 — Pruebas de Reversión (transacciones frescas, se anulan)', 'step');
        log('  Fase 1 permanece intacta. P&L no se altera.', 'info');
        log('', 'info');

        // ── 11. Void SALE ────────────────────────────────────────────────────
        step(11, 'Anular Venta — transacción fresca ₡100');
        {
            useStore.getState().updateAccounts(prev => AccountingActions.registerSale(prev, 100, 'caja_chica'));
            useStore.getState().reconcile();
            const testId = crypto.randomUUID();
            useStore.getState().addTransaction({
                id: testId, type: 'SALE', date: new Date().toISOString(), amount: 100,
                description: '[TEST] Venta para anular', cogs: 0,
                details: { method: 'caja_chica', cart: [{ name: 'Test', qty: 1, price: 100 }] },
            });
            const before = snap();
            // beforeSale = state that existed BEFORE the sale was applied
            const beforeSale = { ...before, caja_chica: before.caja_chica - 100, patrimonio: before.patrimonio - 100, total: before.total - 100 };
            useStore.getState().revertTransaction(testId);
            const tx = useStore.getState().transactions.find(t => t.id === testId);
            if (tx?.status === 'VOIDED') ok('Venta marcada VOIDED');
            else fail('Venta NO fue anulada');
            checkRevert('SALE', beforeSale);
        }

        // ── 12. Void EXPENSE ─────────────────────────────────────────────────
        step(12, 'Anular Gasto — transacción fresca ₡100');
        {
            useStore.getState().updateAccounts(prev => AccountingActions.payExpense(prev, 100, 'banco'));
            useStore.getState().reconcile();
            const testId = crypto.randomUUID();
            useStore.getState().addTransaction({
                id: testId, type: 'EXPENSE', date: new Date().toISOString(), amount: 100,
                description: '[TEST] Gasto para anular', details: { typeName: 'Test', method: 'banco' },
            });
            const before = snap();
            const beforeExp = { ...before, banco: before.banco + 100, patrimonio: before.patrimonio + 100, total: before.total + 100 };
            useStore.getState().revertTransaction(testId);
            const tx = useStore.getState().transactions.find(t => t.id === testId);
            if (tx?.status === 'VOIDED') ok('Gasto marcado VOIDED');
            else fail('Gasto NO fue anulado');
            checkRevert('EXPENSE', beforeExp);
        }

        // ── 13. Void PURCHASE inventory — verifies batchId fix ───────────────
        step(13, 'Anular Compra Inventario — verifica batch FIFO exacto');
        {
            const testItemId  = crypto.randomUUID();
            const testBatchId = crypto.randomUUID();
            const testBatch = { id: testBatchId, date: new Date().toISOString(), stock: 5, cost: 400 };
            useStore.getState().addInventoryItem({ id: testItemId, name: 'Arroz (Test)', cost: 400, stock: 5, batches: [testBatch] });
            useStore.getState().updateAccounts(prev => AccountingActions.purchaseInventory(prev, 2000, 'banco'));
            useStore.getState().reconcile();
            const testId = crypto.randomUUID();
            useStore.getState().addTransaction({
                id: testId, type: 'PURCHASE', date: new Date().toISOString(), amount: 2000,
                description: 'Compra Test: Arroz (x5)',
                details: { itemId: testItemId, itemName: 'Arroz (Test)', batchId: testBatchId, quantity: 5, method: 'banco', type: 'inventory' },
            });
            const before = snap();
            // Purchase is cash↔inventory swap — total assets unchanged
            const beforePurch = { ...before, banco: before.banco + 2000, inventario: before.inventario - 2000, total: before.total };
            useStore.getState().revertTransaction(testId);

            const tx = useStore.getState().transactions.find(t => t.id === testId);
            if (tx?.status === 'VOIDED') ok('Compra marcada VOIDED');
            else fail('Compra NO fue anulada');

            const batchGone = !useStore.getState().inventory.find(i => i.id === testItemId)?.batches?.some(b => b.id === testBatchId);
            if (batchGone) ok('Batch FIFO exacto eliminado ✓');
            else fail('Batch FIFO NO fue eliminado — FIFO pool corrupto');

            checkRevert('PURCHASE-inventory', beforePurch);
        }

        // ── 14. Void cash adjustment — loss ──────────────────────────────────
        step(14, 'Anular Ajuste Caja (Faltante) — verifica diff numérico');
        {
            const s = snap();
            const diffCaja = 300;
            useStore.getState().updateAccounts(prev => AccountingActions.auditCash(prev, s.caja_chica, s.caja_chica - diffCaja, 'caja_chica'));
            useStore.getState().reconcile();
            const testId = crypto.randomUUID();
            useStore.getState().addTransaction({
                id: testId, type: 'ADJUSTMENT', date: new Date().toISOString(),
                amount: diffCaja, description: '[TEST] Ajuste Caja para anular (Dif: -₡300)',
                details: { method: 'caja_chica', diffCaja },
            });
            const before = snap();
            const beforeAdj = { ...before, caja_chica: before.caja_chica + diffCaja, patrimonio: before.patrimonio + diffCaja, total: before.total + diffCaja };
            useStore.getState().revertTransaction(testId);
            const tx = useStore.getState().transactions.find(t => t.id === testId);
            if (tx?.status === 'VOIDED') ok('Ajuste Caja (faltante) marcado VOIDED');
            else fail('Ajuste Caja NO fue anulado');
            checkRevert('ADJUSTMENT-cash-loss', beforeAdj);
        }

        // ── 15. Void inventory count adjustment ──────────────────────────────
        step(15, 'Anular Toma Física Inventario — stock no se restaura (modelo periódico)');
        {
            const lostVal = useStore.getState().consumeInventoryFIFO(panId, 1);
            useStore.getState().reconcile();
            const testId = crypto.randomUUID();
            useStore.getState().addTransaction({
                id: testId, type: 'ADJUSTMENT', date: new Date().toISOString(),
                amount: lostVal, description: '[TEST] Ajuste Inventario para anular', cogs: lostVal,
                details: { itemsAdjusted: [{ name: 'Pan', qty: 1 }] },
            });
            // Inventory count void: stock is NOT restored (periodic model by design).
            // The void removes the COGS from the P&L ledger but accounts don't change.
            const before = snap();
            useStore.getState().revertTransaction(testId);
            const tx = useStore.getState().transactions.find(t => t.id === testId);
            if (tx?.status === 'VOIDED') ok('Ajuste Inventario marcado VOIDED');
            else fail('Ajuste Inventario NO fue anulado');
            checkRevert('ADJUSTMENT-inventory', before); // expects no account change
        }

        // ── 16. Void asset count adjustment ──────────────────────────────────
        step(16, 'Anular Toma Activos Físicos — restaura valor en catálogo');
        {
            const diff = 500;
            const someAsset = useStore.getState().assets[0];
            if (someAsset) {
                const preVal = someAsset.value;
                const newVal = preVal - diff;
                useStore.getState().updateAssetItem(someAsset.id, { value: newVal });
                useStore.getState().reconcile();
                const testId = crypto.randomUUID();
                useStore.getState().addTransaction({
                    id: testId, type: 'ADJUSTMENT', date: new Date().toISOString(),
                    amount: diff, description: '[TEST] Ajuste Activos para anular (Dif: -₡500)', cogs: diff,
                    details: { diff, counts: {}, itemDetails: [{ id: someAsset.id, name: someAsset.name, sysVal: preVal, realVal: newVal }] },
                });
                const before = snap();
                const beforeAdj = { ...before, activo_fijo: before.activo_fijo + diff, patrimonio: before.patrimonio + diff, total: before.total + diff };
                useStore.getState().revertTransaction(testId);
                const tx = useStore.getState().transactions.find(t => t.id === testId);
                if (tx?.status === 'VOIDED') ok('Ajuste Activos marcado VOIDED');
                else fail('Ajuste Activos NO fue anulado');
                checkRevert('ADJUSTMENT-assets', beforeAdj);
            } else {
                fail('No assets found for asset count reversal test');
            }
        }

        // ── 17. Void asset purchase ───────────────────────────────────────────
        step(17, 'Anular Compra Activo Fijo');
        {
            const assetId = crypto.randomUUID();
            useStore.getState().addAssetItem({ id: assetId, name: 'Silla (Test)', value: 1000, quantity: 1 });
            useStore.getState().updateAccounts(prev => AccountingActions.purchaseAsset(prev, 1000, 'caja_chica'));
            useStore.getState().reconcile();
            const testId = crypto.randomUUID();
            useStore.getState().addTransaction({
                id: testId, type: 'PURCHASE', date: new Date().toISOString(), amount: 1000,
                description: '[TEST] Compra Activo para anular',
                details: { assetId, itemName: 'Silla (Test)', quantity: 1, method: 'caja_chica', type: 'asset' },
            });
            const before = snap();
            // Asset purchase is cash↔activo swap — total assets unchanged
            const beforePurch = { ...before, caja_chica: before.caja_chica + 1000, activo_fijo: before.activo_fijo - 1000, total: before.total };
            useStore.getState().revertTransaction(testId);
            const tx = useStore.getState().transactions.find(t => t.id === testId);
            if (tx?.status === 'VOIDED') ok('Compra Activo marcada VOIDED');
            else fail('Compra Activo NO fue anulada');
            checkRevert('PURCHASE-asset', beforePurch);
        }

        // ── 18. Void PRODUCTION ───────────────────────────────────────────────
        step(18, 'Anular Producción — ingrediente restaurado, output eliminado');
        {
            const ingId  = crypto.randomUUID();
            const outId  = crypto.randomUUID();
            const ingBatch = { id: crypto.randomUUID(), date: new Date().toISOString(), stock: 5, cost: 200 };
            useStore.getState().addInventoryItem({ id: ingId, name: 'Azúcar (Test)', cost: 200, stock: 5, batches: [ingBatch] });
            useStore.getState().reconcile();

            const cogs = useStore.getState().consumeInventoryFIFO(ingId, 2); // 2 × ₡200 = ₡400
            const outCostPerUnit = cogs / 5;
            const outBatch = { id: crypto.randomUUID(), date: new Date().toISOString(), stock: 5, cost: outCostPerUnit };
            useStore.getState().addInventoryItem({ id: outId, name: 'Caramelos (Test)', cost: outCostPerUnit, stock: 5, batches: [outBatch] });
            useStore.getState().updateAccounts(prev => AccountingActions.production(prev));
            useStore.getState().reconcile();

            const testId = crypto.randomUUID();
            useStore.getState().addTransaction({
                id: testId, type: 'PRODUCTION', date: new Date().toISOString(),
                amount: cogs, description: 'Cocina: 5x Caramelos (2x Azúcar) [TEST]', cogs,
                details: { outputId: outId, outputName: 'Caramelos (Test)', outputQty: 5,
                    ingredients: [{ item: { id: ingId, name: 'Azúcar (Test)', cost: 200 }, qty: 2 }] },
            });

            // Production is cost-neutral: inventory value is unchanged
            const before = snap();
            useStore.getState().revertTransaction(testId);

            const tx = useStore.getState().transactions.find(t => t.id === testId);
            if (tx?.status === 'VOIDED') ok('Producción marcada VOIDED');
            else fail('Producción NO fue anulada');

            const outItem = useStore.getState().inventory.find(i => i.id === outId);
            const ingItem = useStore.getState().inventory.find(i => i.id === ingId);
            if ((outItem?.stock ?? 1) === 0) ok('Output retirado del inventario físico');
            else fail('Output NO retirado', `stock = ${outItem?.stock}`);
            if (Math.abs((ingItem?.stock ?? 0) - 5) < 0.01) ok('Ingrediente restaurado al stock original');
            else fail('Ingrediente NO restaurado', `stock = ${ingItem?.stock}`);

            checkRevert('PRODUCTION', before); // cost-neutral → accounts unchanged
        }

        // ── 19. Void split-payment SALE ───────────────────────────────────────
        step(19, 'Anular Venta con Pago Mixto (Split Caja ₡300 + Banco ₡200)');
        {
            const splitAmounts = { caja_chica: 300, banco: 200 };
            useStore.getState().updateAccounts(prev => AccountingActions.registerSale(prev, 500, 'split', splitAmounts));
            useStore.getState().reconcile();
            const testId = crypto.randomUUID();
            useStore.getState().addTransaction({
                id: testId, type: 'SALE', date: new Date().toISOString(), amount: 500,
                description: '[TEST] Venta Split para anular', cogs: 0,
                details: { method: 'split', splitAmounts, cart: [{ name: 'Test', qty: 1, price: 500 }] },
            });
            const before = snap();
            const beforeSale = {
                ...before,
                caja_chica: before.caja_chica - 300,
                banco: before.banco - 200,
                patrimonio: before.patrimonio - 500,
                total: before.total - 500,
            };
            useStore.getState().revertTransaction(testId);
            const tx = useStore.getState().transactions.find(t => t.id === testId);
            if (tx?.status === 'VOIDED') ok('Venta Split marcada VOIDED');
            else fail('Venta Split NO fue anulada');
            checkRevert('SALE-split', beforeSale);
        }

        // ── 20. Void cash adjustment — gain ───────────────────────────────────
        step(20, 'Anular Ajuste Banco (Sobrante/Ganancia ₡400)');
        {
            const s = snap();
            const diffBanco = -400; // negative = gain (system < real)
            useStore.getState().updateAccounts(prev => AccountingActions.auditCash(prev, s.banco, s.banco - diffBanco, 'banco'));
            useStore.getState().reconcile();
            const testId = crypto.randomUUID();
            useStore.getState().addTransaction({
                id: testId, type: 'ADJUSTMENT', date: new Date().toISOString(),
                amount: 400, description: '[TEST] Ajuste Banco Sobrante (Dif: +₡400)',
                details: { method: 'banco', diffBanco },
            });
            const before = snap();
            // Gain → banco went UP by 400; reversing means it goes DOWN by 400
            const beforeAdj = { ...before, banco: before.banco - 400, patrimonio: before.patrimonio - 400, total: before.total - 400 };
            useStore.getState().revertTransaction(testId);
            const tx = useStore.getState().transactions.find(t => t.id === testId);
            if (tx?.status === 'VOIDED') ok('Ajuste Banco Sobrante marcado VOIDED');
            else fail('Ajuste Banco Sobrante NO fue anulado');
            checkRevert('ADJUSTMENT-cash-gain', beforeAdj);
        }

        // ── Final ────────────────────────────────────────────────────────────
        log('', 'info');
        const allOk = failed === 0;
        log(`══ RESULTADO: ${passed} pruebas PASADAS, ${failed} FALLIDAS ══`, allOk ? 'ok' : 'fail');
        log('', 'info');
        log('ℹ Fase 1 sigue activa en el store — abre Paso a Paso para ver los Resultados Acumulados', 'info');

        setLogs(entries);
        setSummary({ passed, failed });
    };

    const allPassed = summary ? summary.failed === 0 : null;

    return (
        <Card className={cn(
            "max-w-2xl mx-auto space-y-4 border-2",
            allPassed === true  ? "border-green-500 bg-green-50"  :
            allPassed === false ? "border-red-500   bg-red-50"    :
                                  "border-emerald-200 bg-emerald-50"
        )}>
            <div>
                <h3 className="font-bold text-lg mb-1">Simulación y Auditoría del Sistema</h3>
                <p className="text-sm text-gray-500 mb-1">
                    Resetea a estado limpio y ejecuta 20 pruebas contables verificando
                    <code className="mx-1 bg-gray-100 rounded px-1">Activos = Patrimonio</code>
                    después de cada operación.
                </p>
                <p className="text-xs text-emerald-700 bg-emerald-100 rounded-lg px-3 py-1.5 mb-4">
                    Fase 1 deja transacciones activas → los <strong>Resultados Acumulados</strong> son visibles en Paso a Paso al terminar.
                </p>
                <Button onClick={runAudit} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                    Ejecutar Simulación Contable
                </Button>
            </div>

            {summary && (
                <div className={cn(
                    "text-center font-bold text-sm rounded-lg py-2",
                    allPassed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                )}>
                    {allPassed
                        ? `🎉 Todo correcto — ${summary.passed} pruebas pasadas`
                        : `🔥 ${summary.failed} prueba(s) fallida(s) de ${summary.passed + summary.failed}`}
                </div>
            )}

            {logs.length > 0 && (
                <div className="bg-gray-950 text-gray-200 p-4 rounded-xl font-mono text-xs space-y-0.5 max-h-96 overflow-y-auto">
                    {logs.map((l, i) => (
                        <div key={i} className={cn(
                            'leading-5',
                            l.kind === 'ok'   ? 'text-green-400' :
                            l.kind === 'fail' ? 'text-red-400 font-bold' :
                            l.kind === 'step' ? 'text-yellow-300 mt-1' :
                                                'text-gray-400'
                        )}>
                            {l.msg}
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
};
