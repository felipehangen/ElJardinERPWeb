import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Button, Card, cn } from './ui';
import { AccountingActions } from '../lib/accounting';
import { INITIAL_STATE } from '../types';

// ─── helpers ────────────────────────────────────────────────────────────────

type LogEntry = { msg: string; kind: 'step' | 'ok' | 'fail' | 'info' };

const snap = () => {
    const s = useStore.getState();
    const { banco = 0, caja_chica = 0, inventario = 0, activo_fijo = 0, patrimonio = 0 } = s.accounts;
    return { banco, caja_chica, inventario, activo_fijo, patrimonio, total: banco + caja_chica + inventario + activo_fijo };
};

// ─── component ──────────────────────────────────────────────────────────────

export const SystemAuditTest = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [summary, setSummary] = useState<{ passed: number; failed: number } | null>(null);

    const runAudit = () => {
        const entries: LogEntry[] = [];
        let passed = 0;
        let failed = 0;

        const log = (msg: string, kind: LogEntry['kind'] = 'info') =>
            entries.push({ msg, kind });

        const ok = (label: string, detail = '') => {
            log(`✅ ${label}${detail ? '  →  ' + detail : ''}`, 'ok');
            passed++;
        };
        const fail = (label: string, detail = '') => {
            log(`❌ ${label}${detail ? '  →  ' + detail : ''}`, 'fail');
            failed++;
        };
        const step = (n: number, title: string) =>
            log(`── [${n}] ${title}`, 'step');

        /** Core invariant: Assets = Equity (no liabilities in this business) */
        const checkEq = (label: string) => {
            const { banco, caja_chica, inventario, activo_fijo, patrimonio, total } = snap();
            const diff = Math.abs(total - patrimonio);
            if (diff < 0.02) {
                ok(`Assets = Equity  [${label}]`,
                    `₡${total.toFixed(0)} = ₡${patrimonio.toFixed(0)}`);
            } else {
                fail(`Assets ≠ Equity  [${label}]`,
                    `Assets ₡${total.toFixed(0)} | Patrimonio ₡${patrimonio.toFixed(0)} | Diff ₡${diff.toFixed(2)} | B:${banco.toFixed(0)} CC:${caja_chica.toFixed(0)} Inv:${inventario.toFixed(0)} AF:${activo_fijo.toFixed(0)}`);
            }
        };

        /** After reverting a tx, verify accounts returned to the snapshot taken before the tx */
        const checkRevert = (label: string, before: ReturnType<typeof snap>) => {
            const after = snap();
            const keys: (keyof typeof before)[] = ['banco', 'caja_chica', 'inventario', 'activo_fijo', 'patrimonio'];
            let allMatch = true;
            for (const k of keys) {
                if (Math.abs((before[k] as number) - (after[k] as number)) > 0.02) {
                    fail(`Reversal restored ${k}  [${label}]`,
                        `expected ₡${(before[k] as number).toFixed(0)}, got ₡${(after[k] as number).toFixed(0)}`);
                    allMatch = false;
                }
            }
            if (allMatch) ok(`Reversal restored all accounts  [${label}]`);
            checkEq(`post-void ${label}`);
        };

        // ────────────────────────────────────────────────────────────────────
        log('══════════════════════════════════════════════', 'step');
        log('  EL JARDIN ERP — Simulación Contable v1.0.5', 'step');
        log('══════════════════════════════════════════════', 'step');

        // 0. Reset to absolute blank slate
        step(0, 'Reset a estado limpio');
        useStore.getState().importState({ ...INITIAL_STATE, initialized: true });
        checkEq('estado inicial');

        // ── IDs we'll reuse across steps
        const harinaId = crypto.randomUUID();
        const panId    = crypto.randomUUID();
        let harinaBatchId: string;
        let purchaseTxId: string;
        let saleTxId:     string;
        let expenseTxId:  string;
        let cashAdjTxId:  string;
        let invAdjTxId:   string;
        let assetAdjTxId: string;
        let assetBuyTxId: string;

        // ════════════════════════════════════════════════════════════════════
        log('', 'info');
        log('▶ FASE 1: Transacciones Hacia Adelante', 'step');
        log('', 'info');

        // ── 1. Capital injection
        step(1, 'Inyección de Capital (banco ₡100k + caja ₡50k)');
        useStore.getState().updateAccounts(prev => ({
            ...prev,
            banco: prev.banco + 100000,
            caja_chica: prev.caja_chica + 50000,
            patrimonio: prev.patrimonio + 150000,
        }));
        useStore.getState().addTransaction({
            id: crypto.randomUUID(), type: 'INITIALIZATION',
            date: new Date().toISOString(), amount: 150000,
            description: 'Aporte de Capital (Simulación)',
            details: { isInitialOnboarding: true, cash: 50000, bank: 100000, inventoryValue: 0, assetsValue: 0 }
        });
        checkEq('post-capital');

        // ── 2. Purchase inventory (Harina x10 @₡1000)
        step(2, 'Compra Inventario: Harina x10 @₡1000 c/u (banco)');
        {
            harinaBatchId = crypto.randomUUID();
            const batch = { id: harinaBatchId, date: new Date().toISOString(), stock: 10, cost: 1000 };
            useStore.getState().addInventoryItem({ id: harinaId, name: 'Harina', cost: 1000, stock: 10, batches: [batch] });
            useStore.getState().updateAccounts(prev => AccountingActions.purchaseInventory(prev, 10000, 'banco'));
            purchaseTxId = crypto.randomUUID();
            useStore.getState().addTransaction({
                id: purchaseTxId, type: 'PURCHASE', date: new Date().toISOString(), amount: 10000,
                description: 'Compra Inventario: Harina (x10)',
                details: { itemId: harinaId, itemName: 'Harina', batchId: harinaBatchId, quantity: 10, method: 'banco', type: 'inventory' }
            });
        }
        checkEq('post-compra inventario');

        // Check FIFO batch was added
        {
            const item = useStore.getState().inventory.find(i => i.id === harinaId);
            const batchPresent = item?.batches?.some(b => b.id === harinaBatchId) ?? false;
            if (batchPresent) ok('Batch FIFO registrado correctamente');
            else fail('Batch FIFO NO registrado');
        }

        // ── 3. Purchase asset (Batidora ₡20,000)
        step(3, 'Compra Activo Fijo: Batidora ₡20,000 (caja chica)');
        {
            const assetId = crypto.randomUUID();
            useStore.getState().addAssetItem({ id: assetId, name: 'Batidora', value: 20000, quantity: 1 });
            useStore.getState().updateAccounts(prev => AccountingActions.purchaseAsset(prev, 20000, 'caja_chica'));
            assetBuyTxId = crypto.randomUUID();
            useStore.getState().addTransaction({
                id: assetBuyTxId, type: 'PURCHASE', date: new Date().toISOString(), amount: 20000,
                description: 'Compra Activo: Batidora (x1)',
                details: { itemName: 'Batidora', quantity: 1, method: 'caja_chica', type: 'asset' }
            });
        }
        checkEq('post-compra activo');

        // ── 4. Sale — service (no inventory deduction)
        step(4, 'Venta: Café x2 @₡1,500 = ₡3,000 (caja chica)');
        {
            useStore.getState().updateAccounts(prev => AccountingActions.registerSale(prev, 3000, 0, false, 'caja_chica'));
            saleTxId = crypto.randomUUID();
            useStore.getState().addTransaction({
                id: saleTxId, type: 'SALE', date: new Date().toISOString(), amount: 3000,
                description: 'Venta: Café (x2)', cogs: 0,
                details: { method: 'caja_chica', cart: [{ id: 'cafe', name: 'Café', qty: 2, price: 1500 }] }
            });
        }
        checkEq('post-venta');

        // ── 5. Expense
        step(5, 'Gasto: Luz ₡5,000 (banco)');
        {
            useStore.getState().updateAccounts(prev => AccountingActions.payExpense(prev, 5000, 'banco'));
            expenseTxId = crypto.randomUUID();
            useStore.getState().addTransaction({
                id: expenseTxId, type: 'EXPENSE', date: new Date().toISOString(), amount: 5000,
                description: 'Gasto (Luz)', details: { typeName: 'Luz', method: 'banco' }
            });
        }
        checkEq('post-gasto');

        // ── 6. Production (2 Harina → 10 Pan)
        step(6, 'Producción: 2x Harina → 10x Pan (activo circulante)');
        {
            const cogsProd = useStore.getState().consumeInventoryFIFO(harinaId, 2); // 2 * ₡1000 = ₡2000
            const panBatch = { id: crypto.randomUUID(), date: new Date().toISOString(), stock: 10, cost: cogsProd / 10 };
            useStore.getState().addInventoryItem({ id: panId, name: 'Pan', cost: cogsProd / 10, stock: 10, batches: [panBatch] });
            // production() is a no-op on accounts (asset exchange only)
            useStore.getState().updateAccounts(prev => AccountingActions.production(prev));
            useStore.getState().addTransaction({
                id: crypto.randomUUID(), type: 'PRODUCTION', date: new Date().toISOString(),
                amount: cogsProd, description: 'Cocina: 10x Pan (2x Harina)', cogs: cogsProd,
                details: { outputName: 'Pan', outputQty: 10, ingredients: [{ item: { id: harinaId, name: 'Harina', cost: 1000 }, qty: 2 }] }
            });
        }
        checkEq('post-producción');

        // ── 7. Cash adjustment — LOSS (caja chica)
        step(7, 'Ajuste Caja Chica: faltante de ₡1,000 (pérdida)');
        {
            const s = snap();
            const realVal = s.caja_chica - 1000; // found ₡1000 less
            const diffCaja = s.caja_chica - realVal; // > 0 → loss
            useStore.getState().updateAccounts(prev => AccountingActions.auditCash(prev, s.caja_chica, realVal, 'caja_chica'));
            cashAdjTxId = crypto.randomUUID();
            useStore.getState().addTransaction({
                id: cashAdjTxId, type: 'ADJUSTMENT', date: new Date().toISOString(),
                amount: Math.abs(diffCaja),
                description: `Ajuste Caja Chica (Dif: -₡${Math.abs(diffCaja)})`,
                details: { method: 'caja_chica', diffCaja }
            });
        }
        checkEq('post-ajuste-caja-pérdida');

        // ── 8. Cash adjustment — GAIN (banco)
        step(8, 'Ajuste Bancos: sobrante de ₡500 (ganancia)');
        {
            const s = snap();
            const realVal = s.banco + 500; // found ₡500 more
            const diffBanco = s.banco - realVal; // < 0 → gain
            useStore.getState().updateAccounts(prev => AccountingActions.auditCash(prev, s.banco, realVal, 'banco'));
            useStore.getState().addTransaction({
                id: crypto.randomUUID(), type: 'ADJUSTMENT', date: new Date().toISOString(),
                amount: Math.abs(diffBanco),
                description: `Ajuste Bancos (Dif: +₡${Math.abs(diffBanco)})`,
                details: { method: 'banco', diffBanco }
            });
        }
        checkEq('post-ajuste-banco-ganancia');

        // ── 9. Physical inventory count adjustment
        step(9, 'Toma Física Inventario: 3x Pan faltante');
        {
            const lostValue = useStore.getState().consumeInventoryFIFO(panId, 3);
            useStore.getState().updateAccounts(prev => AccountingActions.adjustInventoryValues(prev, lostValue));
            invAdjTxId = crypto.randomUUID();
            useStore.getState().addTransaction({
                id: invAdjTxId, type: 'ADJUSTMENT', date: new Date().toISOString(),
                amount: lostValue, description: 'Ajuste Físico Inventario (Merma)',
                cogs: lostValue,
                details: { itemsAdjusted: [{ name: 'Pan', qty: 3 }] }
            });
        }
        checkEq('post-toma-física-inventario');

        // ── 10. Asset count adjustment (loss)
        step(10, 'Toma Activos Físicos: Batidora vale ₡2,000 menos');
        {
            const diff = 2000; // positive = loss
            useStore.getState().updateAccounts(prev => ({
                ...prev,
                activo_fijo: (prev.activo_fijo || 0) - diff,
                patrimonio:  (prev.patrimonio  || 0) - diff,
            }));
            assetAdjTxId = crypto.randomUUID();
            useStore.getState().addTransaction({
                id: assetAdjTxId, type: 'ADJUSTMENT', date: new Date().toISOString(),
                amount: diff, description: 'Ajuste de Activos (Dif: -₡2000)',
                cogs: diff,
                details: { diff, counts: {}, itemDetails: [] }
            });
        }
        checkEq('post-toma-activos');

        // ════════════════════════════════════════════════════════════════════
        log('', 'info');
        log('▶ FASE 2: Reversiones (Anulaciones)', 'step');
        log('', 'info');

        // ── 11. Void SALE
        step(11, 'Anular Venta (₡3,000)');
        {
            const before = snap();
            useStore.getState().revertTransaction(saleTxId);
            const tx = useStore.getState().transactions.find(t => t.id === saleTxId);
            if (tx?.status === 'VOIDED') ok('Venta marcada VOIDED');
            else fail('Venta NO fue anulada');
            // caja_chica should be before.caja_chica - 3000, patrimonio - 3000
            const expected = { ...before, caja_chica: before.caja_chica - 3000, patrimonio: before.patrimonio - 3000, total: before.total - 3000 };
            checkRevert('SALE', expected);
        }

        // ── 12. Void EXPENSE
        step(12, 'Anular Gasto (₡5,000)');
        {
            const before = snap();
            useStore.getState().revertTransaction(expenseTxId);
            const tx = useStore.getState().transactions.find(t => t.id === expenseTxId);
            if (tx?.status === 'VOIDED') ok('Gasto marcado VOIDED');
            else fail('Gasto NO fue anulado');
            const expected = { ...before, banco: before.banco + 5000, patrimonio: before.patrimonio + 5000, total: before.total + 5000 };
            checkRevert('EXPENSE', expected);
        }

        // ── 13. Void PURCHASE inventory — test the batchId fix
        step(13, 'Anular Compra Inventario (Harina x10) — verifica batch FIFO');
        {
            const before = snap();
            const batchesBefore = useStore.getState().inventory.find(i => i.id === harinaId)?.batches ?? [];
            useStore.getState().revertTransaction(purchaseTxId);
            const tx = useStore.getState().transactions.find(t => t.id === purchaseTxId);
            if (tx?.status === 'VOIDED') ok('Compra Inventario marcada VOIDED');
            else fail('Compra Inventario NO fue anulada');

            // Check batch was REMOVED
            const batchesAfter = useStore.getState().inventory.find(i => i.id === harinaId)?.batches ?? [];
            const batchGone = !batchesAfter.some(b => b.id === harinaBatchId);
            if (batchGone) ok('Batch FIFO correcto eliminado del inventario');
            else fail('Batch FIFO NO fue eliminado — FIFO pool está corrupto');

            const expected = { ...before, banco: before.banco + 10000, inventario: before.inventario - 10000, total: before.total };
            checkRevert('PURCHASE-inventory', expected);
        }

        // ── 14. Void cash adjustment (loss) — test numeric diff fix
        step(14, 'Anular Ajuste Caja Chica (pérdida ₡1,000) — verifica diff numérico');
        {
            const before = snap();
            useStore.getState().revertTransaction(cashAdjTxId);
            const tx = useStore.getState().transactions.find(t => t.id === cashAdjTxId);
            if (tx?.status === 'VOIDED') ok('Ajuste Caja Chica marcado VOIDED');
            else fail('Ajuste Caja Chica NO fue anulado');
            const expected = { ...before, caja_chica: before.caja_chica + 1000, patrimonio: before.patrimonio + 1000, total: before.total + 1000 };
            checkRevert('ADJUSTMENT-cash-loss', expected);
        }

        // ── 15. Void inventory count adjustment
        step(15, 'Anular Toma Física Inventario (merma Pan)');
        {
            const invBefore = useStore.getState().inventory.find(i => i.id === panId);
            const lostVal = useStore.getState().transactions.find(t => t.id === invAdjTxId)?.cogs ?? 0;
            const before = snap();
            useStore.getState().revertTransaction(invAdjTxId);
            const tx = useStore.getState().transactions.find(t => t.id === invAdjTxId);
            if (tx?.status === 'VOIDED') ok('Ajuste Inventario marcado VOIDED');
            else fail('Ajuste Inventario NO fue anulado');
            const expected = { ...before, inventario: before.inventario + lostVal, patrimonio: before.patrimonio + lostVal, total: before.total + lostVal };
            checkRevert('ADJUSTMENT-inventory', expected);
        }

        // ── 16. Void asset count adjustment
        step(16, 'Anular Toma Activos Físicos (pérdida ₡2,000)');
        {
            const before = snap();
            useStore.getState().revertTransaction(assetAdjTxId);
            const tx = useStore.getState().transactions.find(t => t.id === assetAdjTxId);
            if (tx?.status === 'VOIDED') ok('Ajuste Activos marcado VOIDED');
            else fail('Ajuste Activos NO fue anulado');
            const expected = { ...before, activo_fijo: before.activo_fijo + 2000, patrimonio: before.patrimonio + 2000, total: before.total + 2000 };
            checkRevert('ADJUSTMENT-assets', expected);
        }

        // ── 17. Void PURCHASE asset
        step(17, 'Anular Compra Activo (Batidora ₡20,000)');
        {
            const before = snap();
            useStore.getState().revertTransaction(assetBuyTxId);
            const tx = useStore.getState().transactions.find(t => t.id === assetBuyTxId);
            if (tx?.status === 'VOIDED') ok('Compra Activo marcada VOIDED');
            else fail('Compra Activo NO fue anulada');
            const expected = { ...before, caja_chica: before.caja_chica + 20000, activo_fijo: before.activo_fijo - 20000, total: before.total };
            checkRevert('PURCHASE-asset', expected);
        }

        // ════════════════════════════════════════════════════════════════════
        log('', 'info');
        const allPassed = failed === 0;
        log(`══ RESULTADO: ${passed} pruebas PASADAS, ${failed} FALLIDAS ══`, allPassed ? 'ok' : 'fail');

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
                <p className="text-sm text-gray-500 mb-4">
                    Resetea a estado limpio y ejecuta 17 pruebas contables — cada transacción y su anulación — verificando
                    <code className="mx-1 bg-gray-100 rounded px-1">Activos = Patrimonio</code>
                    después de cada operación.
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
