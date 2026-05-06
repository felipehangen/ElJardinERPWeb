import { useState, useMemo, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { Card, cn, Input, Modal, formatMoney, formatQty } from './ui';
import { List, X, Download, ChevronLeft, ChevronRight, History } from 'lucide-react';
import type { Transaction, Accounts } from '../types';

// Format currency without cents
const fmt = (n: number) => formatMoney(Math.round(n));

const translateTxType = (type: string) => {
    const map: Record<string, string> = {
        SALE: 'VENTA',
        PURCHASE: 'COMPRA',
        EXPENSE: 'GASTO',
        PRODUCTION: 'PRODUCCIÓN',
        ADJUSTMENT: 'AJUSTE',
        INITIALIZATION: 'INICIALIZACIÓN'
    };
    return map[type] || type;
};

const translateMethod = (method: string) => {
    if (method === 'caja_chica') return 'Efectivo';
    if (method === 'banco') return 'Transferencia';
    return method;
};

const getTypeColor = (t: string) => {
    switch (t) {
        case 'SALE': return "bg-green-100 text-green-700";
        case 'PURCHASE': return "bg-blue-100 text-blue-700";
        case 'EXPENSE': return "bg-red-100 text-red-700";
        case 'PRODUCTION': return "bg-amber-100 text-amber-700";
        case 'ADJUSTMENT': return "bg-purple-100 text-purple-700";
        case 'INITIALIZATION': return "bg-teal-100 text-teal-700";
        default: return "bg-gray-100 text-gray-700";
    }
};

const renderTransactionDetails = (tx: Transaction) => {
    if (!tx.details) return null;

    switch (tx.type) {
        case 'SALE':
            return (
                <div className="bg-white border rounded-xl p-4 mt-4 space-y-3">
                    <h4 className="font-bold text-gray-800 text-sm mb-2">Detalle de Productos Vendidos</h4>
                    {tx.details.cart?.map((item: any, i: number) => (
                        <div key={i} className="flex justify-between text-sm py-1 border-b last:border-0 border-gray-100">
                            <span className="text-gray-600">{formatQty(item.qty)}x {item.name}</span>
                            <span className="font-medium">₡{fmt(parseFloat(item.price || '0') * item.qty)}</span>
                        </div>
                    ))}
                    {tx.cogs !== undefined && (
                        <div className="pt-2 flex justify-between text-xs text-gray-500">
                            <span>Costo de Venta (Inventario)</span>
                            <span>₡{fmt(tx.cogs)}</span>
                        </div>
                    )}
                    {tx.cogs !== undefined && (
                        <div className="flex justify-between text-xs font-bold text-emerald-600 mt-1">
                            <span>Margen Bruto</span>
                            <span>₡{fmt(tx.amount - tx.cogs)}</span>
                        </div>
                    )}
                    {tx.details.method && (
                        <div className="pt-2 text-xs text-gray-400 capitalize">Cobrado en: <span className="font-bold text-gray-600">{translateMethod(tx.details.method)}</span></div>
                    )}
                </div>
            );
        case 'PURCHASE':
            return (
                <div className="bg-white border rounded-xl p-4 mt-4 space-y-3">
                    <h4 className="font-bold text-gray-800 text-sm mb-2">Detalle de Compra</h4>
                    <div className="flex justify-between text-sm border-b pb-2 border-gray-100">
                        <span className="text-gray-500">Item Adquirido:</span>
                        <span className="font-medium text-gray-800">{tx.details.itemName} (x{formatQty(tx.details.quantity)})</span>
                    </div>
                    <div className="flex justify-between text-sm border-b pb-2 border-gray-100">
                        <span className="text-gray-500">Clasificación:</span>
                        <span className="font-medium text-gray-800">{tx.details.type === 'asset' ? 'Activo Fijo' : 'Inventario'}</span>
                    </div>
                    {tx.details.providerName && (
                        <div className="flex justify-between text-sm border-b pb-2 border-gray-100">
                            <span className="text-gray-500">Proveedor:</span>
                            <span className="font-medium text-gray-800">{tx.details.providerName}</span>
                        </div>
                    )}
                    {tx.details.method && (
                        <div className="pt-2 text-xs text-gray-400 capitalize">Pagado en: <span className="font-bold text-gray-600">{translateMethod(tx.details.method)}</span></div>
                    )}
                </div>
            );
        case 'EXPENSE':
            return (
                <div className="bg-white border rounded-xl p-4 mt-4 space-y-3">
                    <h4 className="font-bold text-gray-800 text-sm mb-2">Detalle de Gasto</h4>
                    {tx.details.detail && (
                        <div className="flex justify-between text-sm border-b pb-2 border-gray-100">
                            <span className="text-gray-500">Detalle:</span>
                            <span className="font-medium text-gray-800">{tx.details.detail}</span>
                        </div>
                    )}
                    {tx.details.provName && tx.details.provName !== 'N/A' && (
                        <div className="flex justify-between text-sm border-b pb-2 border-gray-100">
                            <span className="text-gray-500">Proveedor:</span>
                            <span className="font-medium text-gray-800">{tx.details.provName}</span>
                        </div>
                    )}
                    {tx.details.method && (
                        <div className="pt-2 text-xs text-gray-400 capitalize">Pagado en: <span className="font-bold text-gray-600">{translateMethod(tx.details.method)}</span></div>
                    )}
                </div>
            );
        case 'ADJUSTMENT':
            if (tx.details.itemsAdjusted !== undefined) {
                return (
                    <div className="bg-white border rounded-xl p-4 mt-4 space-y-2">
                        <h4 className="font-bold text-gray-800 text-sm mb-2">Toma Física de Inventario</h4>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Items ajustados:</span>
                            <span className="font-medium">{tx.details.itemsAdjusted}</span>
                        </div>
                        {tx.cogs !== undefined && (
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Diferencia de valor:</span>
                                <span className={cn("font-bold", tx.cogs > 0 ? "text-red-600" : "text-green-600")}>
                                    {tx.cogs > 0 ? '-' : '+'}₡{fmt(Math.abs(tx.cogs))}
                                </span>
                            </div>
                        )}
                    </div>
                );
            }
            if (tx.details.method) {
                const diff = tx.details.method === 'caja_chica' ? tx.details.diffCaja : tx.details.diffBanco;
                return (
                    <div className="bg-white border rounded-xl p-4 mt-4 space-y-2">
                        <h4 className="font-bold text-gray-800 text-sm mb-2">Ajuste de {tx.details.method === 'caja_chica' ? 'Caja Chica' : 'Bancos'}</h4>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Diferencia:</span>
                            <span className={cn("font-bold", diff > 0 ? "text-red-600" : "text-green-600")}>
                                {diff > 0 ? '-' : '+'}₡{fmt(Math.abs(diff))}
                            </span>
                        </div>
                    </div>
                );
            }
            return null;
        default:
            return null;
    }
};

// ============================================================
// PASO A PASO — Step-by-step ledger replay
// ============================================================

interface BalanceWithPL {
    caja_chica: number;
    banco: number;
    inventario: number;
    activo_fijo: number;
    patrimonio: number;
    ventas: number;
    costos: number;
    gastos: number;
}

interface StepSnapshot {
    tx: Transaction;
    before: BalanceWithPL;
    after: BalanceWithPL;
}

const ZERO_BALANCE: BalanceWithPL = {
    caja_chica: 0, banco: 0, inventario: 0, activo_fijo: 0,
    patrimonio: 0, ventas: 0, costos: 0, gastos: 0
};

function negateDelta(d: Partial<BalanceWithPL>): Partial<BalanceWithPL> {
    const result: Partial<BalanceWithPL> = {};
    (Object.keys(d) as (keyof BalanceWithPL)[]).forEach(k => {
        result[k] = -(d[k] as number);
    });
    return result;
}

function applyDelta(base: BalanceWithPL, delta: Partial<BalanceWithPL>): BalanceWithPL {
    return {
        caja_chica: base.caja_chica + (delta.caja_chica || 0),
        banco: base.banco + (delta.banco || 0),
        inventario: base.inventario + (delta.inventario || 0),
        activo_fijo: base.activo_fijo + (delta.activo_fijo || 0),
        patrimonio: base.patrimonio + (delta.patrimonio || 0),
        ventas: base.ventas + (delta.ventas || 0),
        costos: base.costos + (delta.costos || 0),
        gastos: base.gastos + (delta.gastos || 0),
    };
}

function computeBaseForwardDelta(tx: Transaction): Partial<BalanceWithPL> {
    switch (tx.type) {
        case 'INITIALIZATION':
            return {};

        case 'SALE': {
            const cogs = tx.cogs || 0;
            const delta: Partial<BalanceWithPL> = { patrimonio: tx.amount - cogs, ventas: tx.amount, costos: cogs };
            if (tx.details?.method === 'split' && tx.details?.splitAmounts) {
                delta.caja_chica = tx.details.splitAmounts.caja_chica || 0;
                delta.banco = tx.details.splitAmounts.banco || 0;
            } else if (tx.details?.method === 'banco') {
                delta.banco = tx.amount;
            } else {
                delta.caja_chica = tx.amount;
            }
            if (cogs > 0) delta.inventario = -cogs;
            return delta;
        }

        case 'EXPENSE': {
            const method = tx.details?.method === 'banco' ? 'banco' : 'caja_chica';
            return { [method]: -tx.amount, patrimonio: -tx.amount, gastos: tx.amount } as Partial<BalanceWithPL>;
        }

        case 'PURCHASE': {
            const method = tx.details?.method === 'banco' ? 'banco' : 'caja_chica';
            const isAsset = tx.details?.type === 'asset';
            if (isAsset) return { [method]: -tx.amount, activo_fijo: tx.amount } as Partial<BalanceWithPL>;
            return { [method]: -tx.amount, inventario: tx.amount } as Partial<BalanceWithPL>;
        }

        case 'PRODUCTION':
            return {};

        case 'ADJUSTMENT': {
            const cashAccount = tx.details?.method;
            if (cashAccount === 'caja_chica' || cashAccount === 'banco') {
                const rawDiff = cashAccount === 'caja_chica'
                    ? (tx.details?.diffCaja ?? 0)
                    : (tx.details?.diffBanco ?? 0);
                if (rawDiff > 0) {
                    // Loss: system > real, cash went down
                    return { [cashAccount]: -tx.amount, patrimonio: -tx.amount } as Partial<BalanceWithPL>;
                }
                // Gain: system < real, cash went up
                return { [cashAccount]: tx.amount, patrimonio: tx.amount } as Partial<BalanceWithPL>;
            }
            if (tx.details?.itemsAdjusted !== undefined) {
                // Toma Físico: tx.cogs = exactTotalDiff (positive=loss, negative=gain)
                const diff = tx.cogs ?? 0;
                return { inventario: -diff, patrimonio: -diff };
            }
            if (tx.description?.toLowerCase().includes('activo')) {
                // Asset count adjustment
                const isLoss = tx.description.includes('-');
                if (isLoss) return { activo_fijo: -tx.amount, patrimonio: -tx.amount };
                return { activo_fijo: tx.amount, patrimonio: tx.amount };
            }
            return {};
        }

        default:
            return {};
    }
}

function computeForwardDelta(tx: Transaction, txMap: Record<string, Transaction>): Partial<BalanceWithPL> {
    // ANULACIÓN transaction: its effect is the negation of the original's effect
    if (tx.voidingTxId && tx.status !== 'VOIDED') {
        const original = txMap[tx.voidingTxId];
        if (original) return negateDelta(computeBaseForwardDelta(original));
        return {};
    }
    return computeBaseForwardDelta(tx);
}

function buildSnapshots(transactions: Transaction[], currentAccounts: Accounts): StepSnapshot[] {
    if (!transactions.length) return [];

    const txMap: Record<string, Transaction> = Object.fromEntries(transactions.map(t => [t.id, t]));

    // Sort newest-first for backward replay
    const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Start from current known account state + compute total P&L from all transactions
    let state: BalanceWithPL = {
        caja_chica: currentAccounts.caja_chica || 0,
        banco: currentAccounts.banco || 0,
        inventario: currentAccounts.inventario || 0,
        activo_fijo: currentAccounts.activo_fijo || 0,
        patrimonio: currentAccounts.patrimonio || 0,
        ventas: 0, costos: 0, gastos: 0
    };

    for (const tx of transactions) {
        const delta = computeForwardDelta(tx, txMap);
        state.ventas += delta.ventas || 0;
        state.costos += delta.costos || 0;
        state.gastos += delta.gastos || 0;
    }

    const snapshots: StepSnapshot[] = [];

    for (const tx of sorted) {
        const afterState = { ...state };

        if (tx.type === 'INITIALIZATION') {
            snapshots.push({ tx, before: { ...ZERO_BALANCE }, after: afterState });
            break;
        }

        const delta = computeForwardDelta(tx, txMap);
        const beforeState = applyDelta(afterState, negateDelta(delta));

        snapshots.push({ tx, before: beforeState, after: afterState });
        state = beforeState;
    }

    return snapshots;
}

const AccountRow = ({
    label, before, after, highlight = false, isExpense = false
}: {
    label: string; before: number; after: number; highlight?: boolean; isExpense?: boolean;
}) => {
    const delta = after - before;
    const hasChange = Math.abs(delta) > 0.5;
    const isIncrease = delta > 0;

    // For expenses/costs, an increase is bad (red); for everything else increase is good (green)
    const positiveColor = isExpense ? 'text-red-600' : 'text-green-600';
    const negativeColor = isExpense ? 'text-green-600' : 'text-red-600';
    const deltaColor = !hasChange ? '' : isIncrease ? positiveColor : negativeColor;

    const fmtVal = (n: number) => {
        if (n < 0) return `-₡${fmt(Math.abs(n))}`;
        return `₡${fmt(n)}`;
    };

    return (
        <div className={cn(
            "flex items-center gap-2 px-4 py-3 border-b border-gray-50 last:border-0",
            highlight && "bg-jardin-primary/5"
        )}>
            <div className="w-32 text-sm font-semibold text-gray-600 shrink-0">{label}</div>
            <div className="flex-1 flex items-center gap-1.5 font-mono text-sm min-w-0">
                <span className={cn("shrink-0", hasChange ? "text-gray-400" : highlight ? "font-black text-jardin-primary" : "font-bold text-gray-800")}>
                    {fmtVal(before)}
                </span>
                {hasChange && (
                    <>
                        <ChevronRight size={14} className="text-gray-300 shrink-0" />
                        <span className={cn("font-black shrink-0", highlight ? "text-jardin-primary" : "text-gray-800")}>
                            {fmtVal(after)}
                        </span>
                        <span className={cn("text-xs font-bold ml-auto shrink-0", deltaColor)}>
                            {isIncrease ? '+' : ''}{fmtVal(delta)}
                        </span>
                    </>
                )}
            </div>
        </div>
    );
};

const PasoAPaso = ({ onClose }: { onClose: () => void }) => {
    const { transactions, accounts } = useStore();
    const [stepIndex, setStepIndex] = useState(0);

    const snapshots = useMemo(() => buildSnapshots(transactions, accounts), [transactions, accounts]);

    const goBack = useCallback(() => setStepIndex(i => Math.min(i + 1, snapshots.length - 1)), [snapshots.length]);
    const goForward = useCallback(() => setStepIndex(i => Math.max(i - 1, 0)), []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') goBack();
            if (e.key === 'ArrowRight') goForward();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [goBack, goForward]);

    if (snapshots.length === 0) {
        return (
            <div className="text-center text-gray-400 py-20">
                No hay transacciones para mostrar.
            </div>
        );
    }

    const snap = snapshots[stepIndex];
    const isInit = snap.tx.type === 'INITIALIZATION';
    const isVoided = snap.tx.status === 'VOIDED';
    const isAnulacion = !!snap.tx.voidingTxId && snap.tx.status !== 'VOIDED';

    const utilidadBefore = snap.before.ventas - snap.before.costos - snap.before.gastos;
    const utilidadAfter = snap.after.ventas - snap.after.costos - snap.after.gastos;

    const canGoBack = stepIndex < snapshots.length - 1;
    const canGoForward = stepIndex > 0;

    const positionLabel = `${snapshots.length - stepIndex} / ${snapshots.length}`;

    return (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
            {/* Top bar */}
            <div className="flex items-center justify-between">
                <button
                    onClick={onClose}
                    className="flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-jardin-primary transition-colors"
                >
                    <ChevronLeft size={16} />
                    Lista
                </button>
                <div className="text-center">
                    <div className="font-black text-gray-800 text-lg">{positionLabel}</div>
                    <div className="text-xs text-gray-400 uppercase tracking-widest">transacción</div>
                </div>
                <div className="w-14" />
            </div>

            {/* Navigation */}
            <div className="grid grid-cols-2 gap-3">
                <button
                    disabled={!canGoBack}
                    onClick={goBack}
                    className={cn(
                        "flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all border",
                        canGoBack
                            ? "bg-white border-gray-200 text-gray-700 hover:bg-jardin-primary hover:text-white hover:border-jardin-primary shadow-sm"
                            : "bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed"
                    )}
                >
                    <ChevronLeft size={18} />
                    Retroceder
                </button>
                <button
                    disabled={!canGoForward}
                    onClick={goForward}
                    className={cn(
                        "flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all border",
                        canGoForward
                            ? "bg-white border-gray-200 text-gray-700 hover:bg-jardin-primary hover:text-white hover:border-jardin-primary shadow-sm"
                            : "bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed"
                    )}
                >
                    Avanzar
                    <ChevronRight size={18} />
                </button>
            </div>

            {/* Keyboard hint */}
            <div className="text-center text-xs text-gray-400">
                Usa las teclas ← → para navegar
            </div>

            {/* Transaction card */}
            <div className={cn(
                "rounded-2xl p-4 border",
                isVoided && "bg-gray-50 border-gray-200 opacity-75",
                isAnulacion && "bg-orange-50 border-orange-200",
                isInit && "bg-teal-50 border-teal-200",
                !isVoided && !isAnulacion && !isInit && "bg-white border-gray-100 shadow-sm"
            )}>
                <div className="flex justify-between items-start mb-2">
                    <span className={cn(
                        "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider",
                        isVoided ? "bg-gray-300 text-gray-600" : getTypeColor(snap.tx.type)
                    )}>
                        {isVoided ? 'ANULADA' : isAnulacion ? 'REVERSA' : translateTxType(snap.tx.type)}
                    </span>
                    <span className="text-xs text-gray-400 font-medium">
                        {new Date(snap.tx.date).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                </div>
                <div className="font-semibold text-gray-700 text-sm leading-snug mb-2">{snap.tx.description}</div>
                <div className="text-2xl font-black text-jardin-primary">₡{fmt(snap.tx.amount)}</div>
                {isInit && (
                    <div className="mt-2 text-xs text-teal-600 font-medium">Punto de inicio — el sistema arranca desde aquí</div>
                )}
            </div>

            {/* Balance sheet */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-widest text-gray-500">Balance</span>
                    <span className="text-xs text-gray-400 ml-auto">Antes → Después</span>
                </div>
                <AccountRow label="Caja Chica" before={snap.before.caja_chica} after={snap.after.caja_chica} />
                <AccountRow label="Bancos" before={snap.before.banco} after={snap.after.banco} />
                <AccountRow label="Inventario" before={snap.before.inventario} after={snap.after.inventario} />
                <AccountRow label="Activo Fijo" before={snap.before.activo_fijo} after={snap.after.activo_fijo} />
                <AccountRow label="Patrimonio" before={snap.before.patrimonio} after={snap.after.patrimonio} highlight />
            </div>

            {/* P&L */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-widest text-gray-500">Resultados Acumulados</span>
                    <span className="text-xs text-gray-400 ml-auto">Antes → Después</span>
                </div>
                <AccountRow label="Ventas" before={snap.before.ventas} after={snap.after.ventas} />
                <AccountRow label="Costos" before={snap.before.costos} after={snap.after.costos} isExpense />
                <AccountRow label="Gastos" before={snap.before.gastos} after={snap.after.gastos} isExpense />
                <AccountRow label="Utilidad" before={utilidadBefore} after={utilidadAfter} highlight />
            </div>
        </div>
    );
};

// ============================================================
// Main Transactions Component
// ============================================================

export const Transactions = () => {
    const { transactions, revertTransaction } = useStore();
    const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
    const [showPasoAPaso, setShowPasoAPaso] = useState(false);

    // Filter State
    const [filterType, setFilterType] = useState<string>('ALL');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Filter Transactions
    const filteredTransactions = useMemo(() => {
        if (!transactions) return [];
        return transactions.filter(t => {
            const date = new Date(t.date);
            const start = startDate ? new Date(startDate) : null;
            const end = endDate ? new Date(endDate) : null;
            if (end) end.setHours(23, 59, 59, 999);

            const matchType = filterType === 'ALL' || t.type === filterType;
            const matchStart = !start || date >= start;
            const matchEnd = !end || date <= end;

            return matchType && matchStart && matchEnd;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, filterType, startDate, endDate]);

    const handleDownloadCSV = () => {
        if (filteredTransactions.length === 0) return;
        let csvContent = `Fecha,ID,Tipo,Descripcion,Monto (CRC),Estado\n`;
        filteredTransactions.forEach(tx => {
            const date = new Date(tx.date).toLocaleDateString('es-CR');
            const desc = tx.description.replace(/,/g, ' ');
            const est = tx.status === 'VOIDED' ? 'ANULADA' : 'ACTIVA';
            const typeStr = translateTxType(tx.type);
            csvContent += `"${date}",${tx.id.split('-')[0]},"${typeStr}","${desc}",${tx.amount},"${est}"\n`;
        });
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Transacciones_Historicas.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (showPasoAPaso) {
        return (
            <div className="max-w-xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
                <PasoAPaso onClose={() => setShowPasoAPaso(false)} />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <List className="text-jardin-primary" />
                    Transacciones
                </h2>
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={() => setShowPasoAPaso(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-jardin-primary border border-jardin-primary rounded-xl font-bold hover:bg-jardin-primary hover:text-white transition-all shadow-sm"
                    >
                        <History size={18} />
                        Paso a Paso
                    </button>
                    <button
                        onClick={handleDownloadCSV}
                        className="flex items-center gap-2 px-4 py-2 bg-jardin-primary text-white rounded-xl font-bold hover:bg-jardin-primary-dark transition-all shadow-lg shadow-jardin-primary/20"
                    >
                        <Download size={18} />
                        Descargar CSV
                    </button>
                </div>
            </div>

            <Card className="space-y-4 shadow-sm border border-gray-100">
                <div className="flex flex-col md:flex-row gap-4 justify-between items-end border-b pb-4">
                    <div className="flex flex-wrap gap-4 w-full md:w-auto">
                        <div className="flex flex-col">
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Filtrar por Fecha</label>
                            <div className="flex gap-2">
                                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-auto h-10" />
                                <span className="self-center text-gray-400">-</span>
                                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-auto h-10" />
                            </div>
                        </div>
                    </div>

                    <div className="w-full md:w-48">
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Tipo Transacción</label>
                        <select
                            className="w-full p-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-jardin-primary h-10"
                            value={filterType}
                            onChange={e => setFilterType(e.target.value)}
                        >
                            <option value="ALL">Todas</option>
                            <option value="SALE">Ventas</option>
                            <option value="PURCHASE">Compras</option>
                            <option value="EXPENSE">Gastos</option>
                            <option value="PRODUCTION">Producción</option>
                            <option value="ADJUSTMENT">Ajustes</option>
                            <option value="INITIALIZATION">Inicialización / Aportes</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-sm text-left">
                        <thead className="text-gray-500 bg-gray-50 sticky top-0 z-10 text-xs uppercase">
                            <tr>
                                <th className="p-3">Fecha</th>
                                <th className="p-3">Tipo</th>
                                <th className="p-3">Descripción</th>
                                <th className="p-3 text-right">Monto</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y relative">
                            {filteredTransactions.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-12 text-center text-gray-400">
                                        No se encontraron transacciones.
                                    </td>
                                </tr>
                            )}
                            {filteredTransactions.map((t: Transaction) => (
                                <tr
                                    key={t.id}
                                    className={cn(
                                        "border-b hover:bg-gray-50 transition-colors cursor-pointer",
                                        t.status === 'VOIDED' && "opacity-50 line-through bg-gray-100 hover:bg-gray-200"
                                    )}
                                    onClick={() => setSelectedTx(t)}
                                >
                                    <td className="p-3 text-sm text-gray-500 font-medium whitespace-nowrap">
                                        {new Date(t.date).toLocaleDateString('es-CR')}
                                    </td>
                                    <td className="p-3">
                                        <span className={cn(
                                            "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider whitespace-nowrap",
                                            t.status === 'VOIDED' ? "bg-gray-300 text-gray-600" : getTypeColor(t.type)
                                        )}>
                                            {t.status === 'VOIDED' ? 'ANULADA' : translateTxType(t.type)}
                                        </span>
                                    </td>
                                    <td className="p-3 font-medium text-gray-700 max-w-xs md:max-w-md line-clamp-2" title={t.description}>
                                        {t.status === 'VOIDED' && <span className="text-red-600 font-bold mr-2">[X]</span>}
                                        {t.description}
                                    </td>
                                    <td className="p-3 text-right font-mono font-bold text-gray-800">
                                        ₡{fmt(t.amount)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="text-right text-xs text-gray-400">
                    Mostrando {filteredTransactions.length} transacciones
                </div>
            </Card>

            {/* Transaction Detail Modal */}
            {selectedTx && (
                <Modal isOpen={!!selectedTx} onClose={() => setSelectedTx(null)} title="Detalle de Transacción">
                    <div className="space-y-6">
                        <div className="flex justify-between items-center border-b pb-4">
                            <span className="text-gray-500 text-sm font-medium">{new Date(selectedTx.date).toLocaleString('es-CR')}</span>
                            <span className={cn(
                                "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                                selectedTx.status === 'VOIDED' ? "bg-gray-300 text-gray-800" : getTypeColor(selectedTx.type)
                            )}>
                                {selectedTx.status === 'VOIDED' ? 'ANULADA' : translateTxType(selectedTx.type)}
                            </span>
                        </div>

                        {selectedTx.status === 'VOIDED' && (
                            <div className="bg-red-50 border border-red-200 p-4 rounded-xl text-red-800 text-sm font-medium flex items-center justify-center text-center">
                                <div>
                                    🚨 Esta transacción ha sido anulada. Sus efectos financieros e inventariables han sido revertidos.
                                    {selectedTx.voidingTxId && <><br /><span className="text-xs opacity-75">(Ref: Contra-Asiento {selectedTx.voidingTxId?.split('-')[0]})</span></>}
                                </div>
                            </div>
                        )}

                        <div className="bg-gray-50 p-4 rounded-xl space-y-2 border border-gray-100">
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">ID de Referencia</div>
                            <div className="text-gray-800 font-mono text-sm break-all">{selectedTx.id}</div>
                            {selectedTx.voidingTxId && selectedTx.status !== 'VOIDED' && (
                                <>
                                    <div className="text-xs font-bold text-red-400 uppercase tracking-wider mt-2">Transacción Base (Anulada)</div>
                                    <div className="text-gray-800 font-mono text-sm break-all">{selectedTx.voidingTxId}</div>
                                </>
                            )}
                        </div>

                        <div className="bg-gray-50 p-4 rounded-xl space-y-2 border border-gray-100">
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Descripción del Movimiento</div>
                            <div className="text-gray-800 font-medium text-base leading-relaxed">{selectedTx.description}</div>
                            {renderTransactionDetails(selectedTx)}
                        </div>

                        <div className="bg-jardin-primary/10 p-6 rounded-2xl flex justify-between items-center border border-jardin-primary/20">
                            <span className="font-black text-jardin-primary uppercase tracking-widest text-sm">Monto Registrado</span>
                            <span className={cn(
                                "text-3xl font-black text-jardin-primary",
                                selectedTx.status === 'VOIDED' && "line-through opacity-50 text-gray-500"
                            )}>
                                ₡{fmt(selectedTx.amount)}
                            </span>
                        </div>

                        {/* Reversion Button */}
                        {selectedTx.status !== 'VOIDED' && selectedTx.type !== 'INITIALIZATION' && !selectedTx.voidingTxId && (
                            <button
                                onClick={() => {
                                    if (window.confirm('🚨 ¿Estás seguro de anular esta transacción?\n\nEsta acción revertirá los movimientos de dinero y regresará el inventario a su estado anterior usando las reglas FIFO. Este proceso NO se puede deshacer.')) {
                                        revertTransaction(selectedTx.id);
                                        setSelectedTx(null);
                                    }
                                }}
                                className="w-full mt-4 flex items-center justify-center gap-2 py-4 rounded-xl bg-red-50 text-red-600 font-bold hover:bg-red-100 border border-red-200 transition-colors"
                            >
                                <X size={20} />
                                Anular Transacción Físicamente
                            </button>
                        )}
                    </div>
                </Modal>
            )}
        </div>
    );
};
