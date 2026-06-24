import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Search, Info, TrendingUp, TrendingDown, Download, FilterX, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatMoney, formatQty } from './ui';
import type { Transaction } from '../types';

const WEEK_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#f43f5e', '#06b6d4'];

// Classify an ADJUSTMENT transaction for chart series, mirroring the ledger logic in
// getLedgerAccounts so charts and the books agree:
//   • inventory physical count (details.itemsAdjusted) → cost of goods sold  (asCosto)
//   • cash audit (diffCaja/diffBanco):    loss → asGasto,  gain → asIngreso
//   • asset count (details.diff, no itemsAdjusted): loss → asGasto, gain → asIngreso
// `isRelevant` is false for adjustments that contribute nothing (e.g. unknown/zero diff).
export function classifyAdjustmentForChart(tx: Transaction): {
    asIngreso: number; asGasto: number; asCosto: number; isRelevant: boolean;
} {
    const none = { asIngreso: 0, asGasto: 0, asCosto: 0, isRelevant: false };
    if (tx.type !== 'ADJUSTMENT' || tx.voidingTxId) return none;

    const d = tx.details || {};

    // Inventory physical count → COGS (periodic model). Prefer signed cogs over abs amount.
    if (d.itemsAdjusted !== undefined) {
        const cogs = tx.cogs !== undefined ? tx.cogs : tx.amount;
        return { asIngreso: 0, asGasto: 0, asCosto: cogs, isRelevant: true };
    }

    // Cash audit → other income / other expense.
    const isCash = d.method === 'caja_chica' || d.method === 'banco'
        || d.account === 'caja_chica' || d.account === 'banco';
    if (isCash) {
        const diff = d.diffCaja ?? d.diffBanco;
        if (diff === undefined) return none; // unknown — don't misclassify
        if (diff > 0) return { asIngreso: 0, asGasto: tx.amount, asCosto: 0, isRelevant: true }; // loss
        if (diff < 0) return { asIngreso: tx.amount, asGasto: 0, asCosto: 0, isRelevant: true }; // gain
        return none;
    }

    // Asset count → other income / other expense (NOT cost of sales).
    if (d.diff !== undefined) {
        const diff = d.assetDiff ?? tx.cogs ?? d.diff;
        if (diff > 0) return { asIngreso: 0, asGasto: tx.amount, asCosto: 0, isRelevant: true }; // loss
        if (diff < 0) return { asIngreso: tx.amount, asGasto: 0, asCosto: 0, isRelevant: true }; // gain
        return none;
    }

    return none;
}

const getLocalDateStr = (date: Date): string => {
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().split('T')[0];
};

const getWeekKey = (localDateStr: string): string => {
    const d = new Date(localDateStr + 'T12:00:00');
    const dow = d.getDay();
    const daysToMon = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + daysToMon);
    return d.toISOString().split('T')[0];
};

const formatWeekLabel = (weekKey: string): string => {
    const start = new Date(weekKey + 'T12:00:00');
    const end = new Date(weekKey + 'T12:00:00');
    end.setDate(end.getDate() + 6);
    const s = start.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' });
    const e = end.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' });
    return `${s} – ${e}`;
};

const StatementRow = ({ title, value, onClick, selected, type = 'normal' }: any) => {
    const isNegative = type === 'deduction';
    const isTotal = type === 'total' || type === 'grand-total';
    
    return (
        <div 
            onClick={onClick}
            className={`flex justify-between items-center px-6 py-4 transition-all group border-b border-gray-50 last:border-0 ${
                onClick ? 'cursor-pointer hover:bg-gray-50' : ''
            } ${selected ? 'bg-jardin-primary/5 ring-inset ring-2 ring-jardin-primary/20' : ''} ${
                type === 'grand-total' ? 'bg-gray-900 text-white shadow-inner rounded-b-2xl mt-2' : ''
            } ${isTotal && type !== 'grand-total' ? 'bg-gray-50/80 border-y border-gray-100 my-1' : ''}`}
        >
            <div className={`flex items-center gap-3 ${type === 'grand-total' ? 'text-white' : 'text-gray-700'}`}>
                {onClick ? (
                    <div className={`p-1.5 rounded-full ${selected ? 'bg-jardin-primary text-white' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200 group-hover:text-gray-600'} transition-colors`}>
                        <Search size={14} />
                    </div>
                ) : (
                    <div className="w-7"></div>
                )}
                <span className={`font-medium ${isTotal ? 'text-sm tracking-widest font-bold uppercase' : 'text-[15px]'}`}>
                    {title}
                </span>
            </div>
            <div className={`font-mono font-bold tracking-tight ${
                type === 'grand-total' ? 'text-white text-2xl' : 
                isNegative ? 'text-rose-600 text-lg' : 
                isTotal ? (value >= 0 ? 'text-emerald-700 text-xl' : 'text-rose-700 text-xl') : 
                'text-gray-900 text-lg'
            }`}>
                {value === 0 ? '₡0' : (
                    <span className="flex items-center">
                        {(isNegative || value < 0) && <span className={`font-sans font-light mr-1.5 ${type === 'grand-total' ? 'text-white/50' : 'text-gray-400'}`}>-</span>}
                        ₡{formatMoney(Math.abs(value))}
                    </span>
                )}
            </div>
        </div>
    );
};

export const Analysis = () => {
    const transactions = useStore(state => state.transactions);
    const inventory = useStore(state => state.inventory);
    
    // Daily Chart State
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [expandedTx, setExpandedTx] = useState<string | null>(null);
    const [viewMonth, setViewMonth] = useState(() =>
        new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' }).slice(0, 7)
    );

    // Main Tab State
    const [activeTab, setActiveTab] = useState<'estado' | 'tendencia' | 'top' | 'semanal'>('estado');

    // Income Statement State
    const [statementFilter, setStatementFilter] = useState<'Ventas' | 'Costos' | 'Gastos' | 'Otros Ingresos' | 'Otros Gastos' | null>(null);

    // Weekly trend state
    const [activeWeeks, setActiveWeeks] = useState<string[]>([]);
    const [weekMetric, setWeekMetric] = useState<'ventas' | 'utilidad'>('ventas');

    const toggleWeek = (weekKey: string) => {
        setActiveWeeks(prev =>
            prev.includes(weekKey)
                ? prev.filter(w => w !== weekKey)
                : prev.length < 6 ? [...prev, weekKey] : prev
        );
    };

    // Income Statement Calculations (Using global ledger calculator directly)
    const ledger = useMemo(() => useStore.getState().getLedgerAccounts(), [transactions]);
    const utilidadBruta = ledger.ventas - ledger.costos;
    const utilidadNeta = utilidadBruta - ledger.gastos + ledger.otrosIngresos - ledger.otrosGastos;

    const statementTxs = useMemo(() => {
        if (!statementFilter) return [];
        const validTxs = transactions.filter(t => t.status !== 'VOIDED');
        if (statementFilter === 'Ventas') return validTxs.filter(t => t.type === 'SALE');
        if (statementFilter === 'Gastos') return validTxs.filter(t => t.type === 'EXPENSE');
        if (statementFilter === 'Costos') {
            // Inventory physical counts (details.itemsAdjusted present) → COGS
            // Sales with COGS recorded → also part of cost picture
            return validTxs.filter(t =>
                (t.type === 'SALE' && t.cogs && t.cogs > 0) ||
                (t.type === 'ADJUSTMENT' && !t.voidingTxId && t.details?.itemsAdjusted !== undefined)
            );
        }
        if (statementFilter === 'Otros Ingresos') {
            // Cash gain adjustments (diffCaja < 0 or diffBanco < 0) or asset write-ups (diff < 0)
            return validTxs.filter(t => {
                if (t.type !== 'ADJUSTMENT' || t.voidingTxId) return false;
                const cashMethod = t.details?.method === 'caja_chica' || t.details?.method === 'banco';
                if (cashMethod) {
                    const diff = t.details?.diffCaja ?? t.details?.diffBanco;
                    return diff !== undefined ? diff < 0 : t.description.includes('+');
                }
                // Asset count gain: details.diff < 0 (real > system)
                if (t.details?.diff !== undefined && t.details?.itemsAdjusted === undefined) {
                    return (t.details.diff as number) < 0;
                }
                return false;
            });
        }
        if (statementFilter === 'Otros Gastos') {
            // Cash loss adjustments (diffCaja > 0 or diffBanco > 0) or asset write-downs (diff > 0)
            return validTxs.filter(t => {
                if (t.type !== 'ADJUSTMENT' || t.voidingTxId) return false;
                const cashMethod = t.details?.method === 'caja_chica' || t.details?.method === 'banco';
                if (cashMethod) {
                    const diff = t.details?.diffCaja ?? t.details?.diffBanco;
                    return diff !== undefined ? diff > 0 : !t.description.includes('+');
                }
                // Asset count loss: details.diff > 0 (system > real)
                if (t.details?.diff !== undefined && t.details?.itemsAdjusted === undefined) {
                    return (t.details.diff as number) > 0;
                }
                return false;
            });
        }
        return [];
    }, [statementFilter, transactions]);

    const downloadCategoryCSV = () => {
        if (!statementFilter || statementTxs.length === 0) return;
        let csvContent = `Fecha,ID,Descripcion,Monto (CRC),Costo (CRC),Tipo\n`;
        statementTxs.forEach(tx => {
            const date = new Date(tx.date).toLocaleDateString('es-CR');
            const desc = tx.description.replace(/,/g, ' '); // simple escape
            csvContent += `${date},${tx.id.split('-')[0]},"${desc}",${tx.amount},${tx.cogs || 0},${tx.type}\n`;
        });
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `EstadoResultados_${statementFilter.replace(' ', '')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const downloadCSV = (tx: any) => {
        let csvContent = "";
        if (tx.type === 'ADJUSTMENT') {
            if (tx.details.itemDetails) {
                csvContent = "Articulo,Sistema,Real,Diferencia Unidades,Diferencia Financiera (CRC)\n";
                tx.details.itemDetails.forEach((d: any) => {
                    const sys = d.sysVal ?? d.sys;
                    const real = d.realVal ?? d.real;
                    const diffUnidades = real - sys;
                    csvContent += `"${d.name}",${sys},${real},${diffUnidades},${d.financialDiff}\n`;
                });
            } else if (tx.details.counts) {
                csvContent = "Articulo,Conteo Fisico,Valor Estimado (CRC)\n";
                Object.entries(tx.details.counts as Record<string, string>).forEach(([itemId, valStr]) => {
                    const item = inventory.find(i => i.id === itemId);
                    const realQty = parseFloat(valStr || '0');
                    const estimatedValue = realQty * (item?.cost || 0);
                    csvContent += `"${item?.name || 'Desconocido'}",${realQty},${estimatedValue}\n`;
                });
            }
        }
        if (!csvContent) return;

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Ajuste_${tx.description.substring(0,10)}_${tx.date.split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const chartData = useMemo(() => {
        const validTxs = transactions.filter(t => t.status !== 'VOIDED');
        const dataMap = new Map<string, any>();

        validTxs.forEach(t => {
            const d = new Date(t.date);
            const tzOffset = d.getTimezoneOffset() * 60000;
            const localDate = new Date(d.getTime() - tzOffset).toISOString().split('T')[0];

            if (!dataMap.has(localDate)) {
                dataMap.set(localDate, { date: localDate, Ingresos: 0, Costos: 0, Gastos: 0, txs: [] });
            }

            let daily = dataMap.get(localDate);
            
            let asIngreso = 0;
            let asGasto = 0;
            let asCosto = 0;
            let isRelevant = false;

            if (t.type === 'SALE') {
                asIngreso += t.amount;
                asCosto += t.cogs || 0;
                isRelevant = true;
            } else if (t.type === 'EXPENSE') {
                asGasto += t.amount;
                isRelevant = true;
            } else if (t.type === 'ADJUSTMENT') {
                // Single source of truth — same classification as the ledger (getLedgerAccounts).
                // Fixes asset physical counts that were previously lumped into Costos instead of
                // Gastos/Ingresos. Cash audits and inventory counts are unchanged.
                const c = classifyAdjustmentForChart(t);
                asIngreso += c.asIngreso;
                asGasto += c.asGasto;
                asCosto += c.asCosto;
                isRelevant = c.isRelevant;
            }

            if (isRelevant) {
                daily.Ingresos += asIngreso;
                daily.Costos += asCosto;
                daily.Gastos += asGasto;
                daily.txs.push(t);
            }
        });

        const arr = Array.from(dataMap.values()).filter(d => d.Ingresos > 0 || d.Costos > 0 || d.Gastos > 0);
        arr.sort((a, b) => a.date.localeCompare(b.date));
        
        let runningAccum = 0;
        arr.forEach(d => {
            const net = d.Ingresos - d.Costos - d.Gastos;
            runningAccum += net;
            d.Acumulado = runningAccum;
        });

        return arr;
    }, [transactions]);

    const topProducts = useMemo(() => {
        const prodMap = new Map<string, {name: string, qty: number, revenue: number}>();
        transactions.filter(t => t.type === 'SALE' && t.status !== 'VOIDED' && t.details?.cart).forEach(t => {
            (t.details.cart as any[]).forEach((c: any) => {
                if (!prodMap.has(c.id)) {
                    prodMap.set(c.id, { name: c.name, qty: 0, revenue: 0 });
                }
                const entry = prodMap.get(c.id)!;
                entry.qty += c.qty;
                entry.revenue += (parseFloat(c.price || '0') * c.qty);
            });
        });
        return Array.from(prodMap.values()).sort((a, b) => b.qty - a.qty);
    }, [transactions]);

    const availableWeeks = useMemo(() => {
        const weekMap = new Map<string, { key: string; label: string; ventas: number }>();
        transactions.filter(t => t.status !== 'VOIDED').forEach(t => {
            const localDate = getLocalDateStr(new Date(t.date));
            const weekKey = getWeekKey(localDate);
            if (!weekMap.has(weekKey)) weekMap.set(weekKey, { key: weekKey, label: formatWeekLabel(weekKey), ventas: 0 });
            if (t.type === 'SALE') weekMap.get(weekKey)!.ventas += t.amount;
        });
        return Array.from(weekMap.values())
            .filter(w => w.ventas > 0)
            .sort((a, b) => b.key.localeCompare(a.key));
    }, [transactions]);

    const weekChartData = useMemo(() => {
        const DOW_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        const validTxs = transactions.filter(t => t.status !== 'VOIDED');
        const wd: Record<string, Record<number, { ventas: number; utilidad: number }>> = {};
        activeWeeks.forEach(wk => {
            wd[wk] = {};
            for (let i = 0; i < 7; i++) wd[wk][i] = { ventas: 0, utilidad: 0 };
        });
        validTxs.forEach(t => {
            const localDate = getLocalDateStr(new Date(t.date));
            const wk = getWeekKey(localDate);
            if (!activeWeeks.includes(wk)) return;
            const dow = (new Date(localDate + 'T12:00:00').getDay() + 6) % 7;
            const d = wd[wk][dow];
            if (t.type === 'SALE') { d.ventas += t.amount; d.utilidad += t.amount - (t.cogs || 0); }
            else if (t.type === 'EXPENSE') { d.utilidad -= t.amount; }
        });
        return DOW_LABELS.map((label, i) => {
            const row: Record<string, any> = { dow: label };
            activeWeeks.forEach(wk => { row[wk] = wd[wk]?.[i]?.[weekMetric] ?? 0; });
            return row;
        });
    }, [activeWeeks, transactions, weekMetric]);

    const weekSummaries = useMemo(() => {
        const validTxs = transactions.filter(t => t.status !== 'VOIDED');
        return activeWeeks.map(weekKey => {
            let ventas = 0, egresos = 0, costos = 0;
            validTxs.forEach(t => {
                if (getWeekKey(getLocalDateStr(new Date(t.date))) !== weekKey) return;
                if (t.type === 'SALE') ventas += t.amount;
                else if (t.type === 'EXPENSE') egresos += t.amount;
                else if (t.type === 'ADJUSTMENT' && !t.voidingTxId && t.details?.itemsAdjusted !== undefined)
                    costos += t.cogs ?? t.amount;
            });
            return { weekKey, ventas, egresos, costos, utilidad: ventas - costos - egresos };
        });
    }, [activeWeeks, transactions]);

    const activeTxs = chartData.find(d => d.date === selectedDate)?.txs || [];

    // ── Month navigation helpers ──────────────────────────────────────────
    const monthDisplayName = useMemo(() => {
        const [y, m] = viewMonth.split('-').map(Number);
        return new Date(y, m - 1, 1).toLocaleDateString('es-CR', { month: 'long', year: 'numeric' });
    }, [viewMonth]);

    const monthChartData = useMemo(() => {
        const [y, m] = viewMonth.split('-').map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        const dayMap = new Map<number, { Ventas: number; Egresos: number; Neto: number; txs: any[] }>();
        chartData
            .filter(d => d.date.startsWith(viewMonth))
            .forEach(d => {
                const day = parseInt(d.date.split('-')[2]);
                dayMap.set(day, {
                    Ventas: d.Ingresos || 0,
                    Egresos: (d.Costos || 0) + (d.Gastos || 0),
                    Neto: (d.Ingresos || 0) - (d.Costos || 0) - (d.Gastos || 0),
                    txs: d.txs || [],
                });
            });
        let cumVentas = 0, cumEgresos = 0, cumUtilidad = 0;
        return Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const d = dayMap.get(day);
            cumVentas   += d?.Ventas ?? 0;
            cumEgresos  -= d?.Egresos ?? 0;   // negative → va hacia abajo
            cumUtilidad += d?.Neto ?? 0;
            return { day, Ventas: cumVentas, Egresos: cumEgresos, Utilidad: cumUtilidad, hasTxs: !!d };
        });
    }, [chartData, viewMonth]);

    const monthSummary = useMemo(() => {
        const last = monthChartData[monthChartData.length - 1];
        return last
            ? { ventas: last.Ventas, egresos: last.Egresos, neto: last.Utilidad }
            : { ventas: 0, egresos: 0, neto: 0 };
    }, [monthChartData]);

    const goPrevMonth = () => {
        const [y, m] = viewMonth.split('-').map(Number);
        const d = new Date(y, m - 2, 1);
        setViewMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        setSelectedDate(null);
    };
    const goNextMonth = () => {
        const [y, m] = viewMonth.split('-').map(Number);
        const d = new Date(y, m, 1);
        setViewMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        setSelectedDate(null);
    };

    // Helper to render transaction rows
    const renderTxRow = (tx: any) => (
        <div key={tx.id} className="flex flex-col rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors overflow-hidden">
            <div 
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => setExpandedTx(expandedTx === tx.id ? null : tx.id)}
            >
                <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl ${
                        tx.type === 'SALE' ? 'bg-emerald-100 text-emerald-600' : 
                        tx.type === 'EXPENSE' ? 'bg-rose-100 text-rose-600' : 
                        tx.type === 'ADJUSTMENT' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'
                    }`}>
                        {tx.type === 'SALE' && <TrendingUp size={20} />}
                        {tx.type === 'EXPENSE' && <TrendingDown size={20} />}
                        {tx.type === 'ADJUSTMENT' && <Info size={20} />}
                        {tx.type !== 'SALE' && tx.type !== 'EXPENSE' && tx.type !== 'ADJUSTMENT' && <Info size={20} />}
                    </div>
                    <div>
                        <h4 className="font-semibold text-gray-900 flex items-center gap-2">{
                            tx.type === 'SALE' ? 'Venta' :
                            tx.type === 'EXPENSE' ? 'Gasto' :
                            tx.type === 'ADJUSTMENT' ? 'Ajuste' : tx.type
                        } {tx.details && <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">Click detalle</span>}</h4>
                        <p className="text-sm text-gray-500">{tx.description || 'Sin descripción'}</p>
                        <p className="text-xs text-gray-400 mt-1">{new Date(tx.date).toLocaleDateString('es-CR')} - {new Date(tx.date).toLocaleTimeString('es-CR', {hour: '2-digit', minute:'2-digit'})}</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="font-bold text-gray-900">
                        ₡{formatMoney(tx.amount)}
                    </div>
                    {tx.cogs !== undefined && tx.cogs > 0 && (
                        <div className="text-xs text-amber-600 mt-1 flex items-center justify-end gap-1">
                            <Info size={12} /> Costo: ₡{formatMoney(tx.cogs)}
                        </div>
                    )}
                </div>
            </div>
            
            {expandedTx === tx.id && tx.details && (
                <div className="px-4 pb-4 pt-2 border-t border-gray-200 mt-1 text-sm text-gray-600 bg-white mx-2 mb-2 rounded-xl border">
                    <div className="flex items-center justify-between mb-2">
                        <div className="font-bold text-xs uppercase text-gray-400">Detalle del Registro</div>
                        {tx.type === 'ADJUSTMENT' && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); downloadCSV(tx); }}
                                className="flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-1 rounded hover:bg-emerald-100 transition-colors"
                            >
                                <Download size={12} /> Exportar CSV
                            </button>
                        )}
                    </div>
                    {tx.type === 'ADJUSTMENT' && (tx.details.itemDetails || tx.details.counts) ? (
                        <ul className="space-y-1 mt-2 text-xs">
                            {tx.details.itemDetails ? 
                                tx.details.itemDetails.map((detail: any) => (
                                    <li key={detail.id} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-gray-900">{detail.name}</span>
                                            <span className="text-[10px] text-gray-500">
                                                Sistema: {detail.sysVal ?? detail.sys} → Real: {detail.realVal ?? detail.real} 
                                                <span className="font-bold ml-1">
                                                    ({(detail.realVal ?? detail.real) - (detail.sysVal ?? detail.sys) > 0 ? '+' : ''}{(detail.realVal ?? detail.real) - (detail.sysVal ?? detail.sys)} {detail.sysVal !== undefined ? 'Valor' : 'Unidades'})
                                                </span>
                                            </span>
                                        </div>
                                        <div className={`font-mono font-bold ${detail.financialDiff > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                            {detail.financialDiff > 0 ? '-' : '+'}₡{formatMoney(Math.abs(detail.financialDiff))}
                                        </div>
                                    </li>
                                ))
                            : Object.entries(tx.details.counts as Record<string, string>).map(([itemId, valStr]) => {
                                const item = inventory.find(i => i.id === itemId);
                                const realQty = parseFloat(valStr || '0');
                                const estimatedValue = realQty * (item?.cost || 0);

                                return (
                                    <li key={itemId} className="flex justify-between items-center bg-gray-50 p-2 rounded opacity-80">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-gray-900">{item?.name || 'Artículo Desconocido'}</span>
                                            <span className="flex items-center gap-2 mt-0.5">
                                                 <span className="text-gray-600 text-[10px]">Conteo Físico Digitado: {valStr || '0'}</span>
                                            </span>
                                        </div>
                                        <div className="font-mono text-gray-500 font-bold text-xs text-right">
                                             <div>Valor (est):</div>
                                             <div>₡{formatMoney(estimatedValue)}</div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : tx.type === 'SALE' && tx.details.cart ? (
                        <ul className="space-y-1 mt-2 text-xs">
                            {(tx.details.cart as any[]).map((c, i) => (
                                <li key={i} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                                    <span><span className="font-bold">{formatQty(c.qty)}x</span> {c.name}</span>
                                    <span className="font-mono">₡{formatMoney(Number(c.price))}</span>
                                </li>
                            ))}
                        </ul>
                    ) : tx.type === 'PRODUCTION' && tx.details.ingredients ? (
                        <ul className="space-y-1 mt-2 text-xs">
                            {(tx.details.ingredients as any[]).map((ing, i) => (
                                <li key={i} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                                    <span><span className="font-bold">{formatQty(ing.qty)}x</span> {ing.item.name}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <pre className="text-[10px] bg-gray-50 p-2 rounded overflow-x-auto mt-2 text-gray-500">
                            {JSON.stringify(tx.details, null, 2)}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">Análisis y Estado de Resultados</h1>
                <p className="text-gray-500 mt-2">Visión general del negocio y comportamiento histórico de movimientos.</p>
            </div>

            <div className="flex bg-gray-100 p-1 rounded-xl w-fit -mt-2">
                <button 
                    onClick={() => setActiveTab('estado')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'estado' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Estado de Resultados (Global)
                </button>
                <button 
                    onClick={() => setActiveTab('tendencia')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'tendencia' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Tendencia Diaria
                </button>
                <button
                    onClick={() => setActiveTab('top')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'top' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Más Vendidos
                </button>
                <button
                    onClick={() => setActiveTab('semanal')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'semanal' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Tendencia Semanal
                </button>
            </div>

            {/* Income Statement Section */}
            {activeTab === 'estado' && (
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
                    <h2 className="text-lg font-semibold mb-6 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FileText className="text-jardin-primary" />
                            Estado de Resultados Global
                        </div>
                    </h2>

                    {/* Contenedor del Estado de Resultados Estilo Ledger */}
                    <div className="max-w-4xl mx-auto border border-gray-100 rounded-2xl shadow-sm bg-white overflow-hidden mb-8">
                        <div className="bg-gray-50/80 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2"><FileText size={14} className="text-jardin-primary"/> Reporte Financiero Consolidado</h3>
                            <span className="text-xs text-gray-400 font-mono">Moneda: CRC</span>
                        </div>
                        <div className="flex flex-col">
                            <StatementRow title="Ingresos Operativos (Ventas)" value={ledger.ventas} onClick={() => setStatementFilter(statementFilter === 'Ventas' ? null : 'Ventas')} selected={statementFilter === 'Ventas'} />
                            <StatementRow title="Costos Directos (Costo de Venta / Diferencias Inv.)" value={ledger.costos} onClick={() => setStatementFilter(statementFilter === 'Costos' ? null : 'Costos')} selected={statementFilter === 'Costos'} type="deduction" />
                            
                            <StatementRow title="Utilidad Bruta" value={utilidadBruta} type="total" />
                            
                            <StatementRow title="Gastos Operativos" value={ledger.gastos} onClick={() => setStatementFilter(statementFilter === 'Gastos' ? null : 'Gastos')} selected={statementFilter === 'Gastos'} type="deduction" />
                            <StatementRow title="Otros Ingresos (Ajustes Sobrantes +)" value={ledger.otrosIngresos} onClick={() => setStatementFilter(statementFilter === 'Otros Ingresos' ? null : 'Otros Ingresos')} selected={statementFilter === 'Otros Ingresos'} />
                            <StatementRow title="Otros Gastos (Ajustes Caja / Faltantes -)" value={ledger.otrosGastos} onClick={() => setStatementFilter(statementFilter === 'Otros Gastos' ? null : 'Otros Gastos')} selected={statementFilter === 'Otros Gastos'} type="deduction" />
                            
                            <StatementRow title="Utilidad Neta del Ejercicio" value={utilidadNeta} type="grand-total" />
                        </div>
                    </div>

                    {statementFilter && (
                        <div className="mt-8 border-t border-gray-100 pt-6 animate-in slide-in-from-top-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                                <h3 className="text-xl font-bold flex items-center gap-2 text-jardin-primary">
                                    Detalle de {statementFilter}
                                    <span className="text-sm font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{statementTxs.length} registros</span>
                                </h3>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={downloadCategoryCSV}
                                        className="flex flex-1 sm:flex-none justify-center items-center gap-2 text-sm bg-jardin-primary text-white px-4 py-2 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95"
                                    >
                                        <Download size={16} /> Exportar Lista a CSV
                                    </button>
                                    <button 
                                        onClick={() => setStatementFilter(null)}
                                        className="flex justify-center items-center gap-2 text-sm bg-gray-100 text-gray-600 px-4 py-2 rounded-xl hover:bg-gray-200 transition-colors"
                                    >
                                        <FilterX size={16} /> Cerrar
                                    </button>
                                </div>
                            </div>

                            {statementTxs.length === 0 ? (
                                <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-2xl">
                                    No se encontraron registros para {statementFilter}.
                                </div>
                            ) : (
                                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                                    {statementTxs.map(renderTxRow)}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Daily Trend — reimagined with month selector */}
            {activeTab === 'tendencia' && (
                <div className="animate-in fade-in zoom-in-95 duration-200 space-y-4">

                    {/* Main chart card */}
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">

                        {/* Month navigator */}
                        <div className="flex items-center justify-between px-6 pt-6 pb-4">
                            <button
                                onClick={goPrevMonth}
                                className="p-2.5 rounded-2xl hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-400 hover:text-gray-700"
                                aria-label="Mes anterior"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <div className="text-center select-none">
                                <h2 className="text-2xl font-extrabold text-gray-900 capitalize tracking-tight">{monthDisplayName}</h2>
                                <p className="text-[10px] text-gray-400 mt-0.5 font-semibold tracking-[0.1em] uppercase">Tendencia diaria de ingresos</p>
                            </div>
                            <button
                                onClick={goNextMonth}
                                className="p-2.5 rounded-2xl hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-400 hover:text-gray-700"
                                aria-label="Mes siguiente"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>

                        {/* KPI summary strip */}
                        <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-b border-gray-100 bg-gray-50/60">
                            <div className="px-4 py-4 text-center">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-1">Ventas</div>
                                <div className="text-lg font-black text-emerald-600 font-mono leading-tight">₡{formatMoney(monthSummary.ventas)}</div>
                            </div>
                            <div className="px-4 py-4 text-center">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-1">Egresos</div>
                                <div className="text-lg font-black text-rose-500 font-mono leading-tight">₡{formatMoney(Math.abs(monthSummary.egresos))}</div>
                            </div>
                            <div className="px-4 py-4 text-center">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-1">Utilidad</div>
                                <div className="text-lg font-black font-mono leading-tight text-blue-600">
                                    {monthSummary.neto < 0 ? '-' : ''}₡{formatMoney(Math.abs(monthSummary.neto))}
                                </div>
                            </div>
                        </div>

                        {/* Area chart */}
                        <div className="px-2 pt-6 pb-3">
                            {monthChartData.every(d => d.Ventas === 0 && d.Egresos === 0) ? (
                                <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-gray-300">
                                    <TrendingUp size={36} strokeWidth={1.5} />
                                    <p className="text-sm font-medium capitalize">Sin movimientos en {monthDisplayName}</p>
                                </div>
                            ) : (
                                <div className="h-[220px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={monthChartData} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="gVentas" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="2%" stopColor="#10b981" stopOpacity={0.28} />
                                                    <stop offset="98%" stopColor="#10b981" stopOpacity={0.02} />
                                                </linearGradient>
                                                <linearGradient id="gEgresos" x1="0" y1="1" x2="0" y2="0">
                                                    <stop offset="2%" stopColor="#f43f5e" stopOpacity={0.22} />
                                                    <stop offset="98%" stopColor="#f43f5e" stopOpacity={0.02} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                                            <XAxis
                                                dataKey="day"
                                                tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 500 }}
                                                tickLine={false}
                                                axisLine={false}
                                                interval={2}
                                            />
                                            <YAxis
                                                tickFormatter={v => v === 0 ? '0' : `₡${formatMoney(v)}`}
                                                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                                                tickLine={false}
                                                axisLine={false}
                                                width={74}
                                            />
                                            <Tooltip
                                                formatter={(value: any, name: string) => {
                                                    const v = Number(value);
                                                    // Egresos se guarda negativo pero representa salida → mostrar positivo
                                                    if (name === 'Egresos') return [`₡${formatMoney(Math.abs(v))}`, name];
                                                    // Utilidad respeta su signo
                                                    return [v < 0 ? `-₡${formatMoney(Math.abs(v))}` : `₡${formatMoney(v)}`, name];
                                                }}
                                                labelFormatter={(label: any) => `Día ${label} · ${monthDisplayName}`}
                                                contentStyle={{
                                                    borderRadius: '14px',
                                                    border: 'none',
                                                    boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.12), 0 4px 10px -6px rgb(0 0 0 / 0.08)',
                                                    fontSize: '12px',
                                                    padding: '10px 14px',
                                                }}
                                                cursor={{ stroke: '#E5E7EB', strokeWidth: 1 }}
                                            />
                                            <ReferenceLine y={0} stroke="#E5E7EB" strokeDasharray="4 4" />
                                            <Area
                                                type="monotone"
                                                dataKey="Ventas"
                                                stroke="#10b981"
                                                strokeWidth={2.5}
                                                fill="url(#gVentas)"
                                                dot={false}
                                                activeDot={{ r: 5, fill: '#10b981', strokeWidth: 0 }}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="Egresos"
                                                stroke="#f43f5e"
                                                strokeWidth={1.5}
                                                fill="url(#gEgresos)"
                                                dot={false}
                                                activeDot={{ r: 4, fill: '#f43f5e', strokeWidth: 0 }}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="Utilidad"
                                                stroke="#3b82f6"
                                                strokeWidth={2}
                                                dot={false}
                                                activeDot={{ r: 5, fill: '#3b82f6', strokeWidth: 0 }}
                                                strokeDasharray="6 3"
                                            />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                            {/* Legend */}
                            <div className="flex items-center justify-center gap-5 pt-3 pb-1">
                                <span className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />Ventas
                                </span>
                                <span className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
                                    <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />Egresos
                                </span>
                                <span className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
                                    <span className="inline-block w-5 border-t-2 border-dashed border-blue-400" />Utilidad
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Day selector */}
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.12em] mb-3 px-1">
                            Seleccioná un día · {monthChartData.filter(d => d.hasTxs).length} con movimientos
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {monthChartData.map(d => {
                                const dateStr = `${viewMonth}-${String(d.day).padStart(2, '0')}`;
                                const isSelected = selectedDate === dateStr;
                                return (
                                    <button
                                        key={d.day}
                                        onClick={() => d.hasTxs && setSelectedDate(isSelected ? null : dateStr)}
                                        className={`relative w-10 h-10 rounded-2xl text-sm font-bold transition-all duration-150 ${
                                            isSelected
                                                ? 'bg-jardin-primary text-white shadow-lg scale-110 ring-2 ring-jardin-primary/30'
                                                : d.hasTxs
                                                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80 hover:scale-105 cursor-pointer'
                                                    : 'bg-gray-50 text-gray-300 cursor-default'
                                        }`}
                                    >
                                        {d.day}
                                        {d.hasTxs && !isSelected && (
                                            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Transaction detail for selected day */}
                    {selectedDate && activeTxs.length > 0 && (
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 animate-in slide-in-from-bottom-4 duration-200">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-xl font-extrabold text-gray-900 capitalize">
                                        {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-CR', {
                                            weekday: 'long', day: 'numeric', month: 'long'
                                        })}
                                    </h3>
                                    <p className="text-sm text-gray-400 mt-0.5">
                                        {activeTxs.length} movimiento{activeTxs.length !== 1 ? 's' : ''}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setSelectedDate(null)}
                                    className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-xl transition-colors text-sm font-medium"
                                >
                                    Cerrar
                                </button>
                            </div>
                            <div className="space-y-3">
                                {activeTxs.map(renderTxRow)}
                            </div>
                        </div>
                    )}

                </div>
            )}

            {/* Weekly Trend Section */}
            {activeTab === 'semanal' && (
                <div className="animate-in fade-in zoom-in-95 duration-200 space-y-4">

                    {/* Week picker */}
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="font-bold text-gray-900">Seleccionar semanas</h3>
                                <p className="text-xs text-gray-400 mt-0.5">{activeWeeks.length} seleccionada{activeWeeks.length !== 1 ? 's' : ''} · máximo 6</p>
                            </div>
                            {activeWeeks.length > 0 && (
                                <button onClick={() => setActiveWeeks([])} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                                    Limpiar todo
                                </button>
                            )}
                        </div>
                        {availableWeeks.length === 0 ? (
                            <p className="text-sm text-gray-400 py-4 text-center">No hay semanas con ventas registradas.</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {availableWeeks.map(wk => {
                                    const colorIdx = activeWeeks.indexOf(wk.key);
                                    const isSelected = colorIdx >= 0;
                                    const isDisabled = !isSelected && activeWeeks.length >= 6;
                                    return (
                                        <button
                                            key={wk.key}
                                            onClick={() => toggleWeek(wk.key)}
                                            disabled={isDisabled}
                                            className={`flex flex-col px-3.5 py-2.5 rounded-2xl border text-left transition-all ${
                                                isSelected
                                                    ? 'border-transparent text-white shadow-md scale-105'
                                                    : isDisabled
                                                        ? 'border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed'
                                                        : 'border-gray-200 text-gray-700 hover:border-gray-300 bg-white hover:scale-105'
                                            }`}
                                            style={isSelected ? { backgroundColor: WEEK_COLORS[colorIdx], borderColor: WEEK_COLORS[colorIdx] } : {}}
                                        >
                                            <span className="text-xs font-bold whitespace-nowrap">{wk.label}</span>
                                            <span className={`text-[10px] font-mono mt-0.5 ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                                                ₡{formatMoney(wk.ventas)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {activeWeeks.length === 0 ? (
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-14 text-center">
                            <TrendingUp size={40} className="mx-auto text-gray-200 mb-4" strokeWidth={1.5} />
                            <p className="text-gray-400 font-medium">Seleccioná semanas para comparar su tendencia</p>
                            <p className="text-xs text-gray-300 mt-1">Podés elegir hasta 6 semanas a la vez</p>
                        </div>
                    ) : (
                        <>
                            {/* Metric toggle */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setWeekMetric('ventas')}
                                    className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                                        weekMetric === 'ventas' ? 'bg-emerald-500 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
                                    }`}
                                >
                                    Ventas por día
                                </button>
                                <button
                                    onClick={() => setWeekMetric('utilidad')}
                                    className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                                        weekMetric === 'utilidad' ? 'bg-blue-500 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
                                    }`}
                                >
                                    Utilidad por día
                                </button>
                            </div>

                            {/* Line chart */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
                                <h3 className="font-semibold text-gray-900 mb-5">
                                    {weekMetric === 'ventas' ? 'Ventas' : 'Utilidad Neta'} por día de la semana
                                </h3>
                                <div className="h-[250px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={weekChartData} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                                            <XAxis dataKey="dow" tick={{ fill: '#9CA3AF', fontSize: 13, fontWeight: 600 }} axisLine={false} tickLine={false} />
                                            <YAxis
                                                tickFormatter={v => v === 0 ? '0' : `₡${formatMoney(v)}`}
                                                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                                                axisLine={false} tickLine={false} width={74}
                                            />
                                            <Tooltip
                                                formatter={(value: any, name: string) => {
                                                    const wk = availableWeeks.find(w => w.key === name);
                                                    const v = Number(value);
                                                    return [v < 0 ? `-₡${formatMoney(Math.abs(v))}` : `₡${formatMoney(v)}`, wk?.label || name];
                                                }}
                                                contentStyle={{ borderRadius: '14px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.12)', fontSize: '12px', padding: '10px 14px' }}
                                            />
                                            <ReferenceLine y={0} stroke="#E5E7EB" strokeDasharray="4 4" />
                                            {activeWeeks.map((weekKey, i) => (
                                                <Line
                                                    key={weekKey}
                                                    type="monotone"
                                                    dataKey={weekKey}
                                                    stroke={WEEK_COLORS[i % WEEK_COLORS.length]}
                                                    strokeWidth={2.5}
                                                    dot={{ r: 4, fill: WEEK_COLORS[i % WEEK_COLORS.length], strokeWidth: 2, stroke: '#fff' }}
                                                    activeDot={{ r: 6, strokeWidth: 0 }}
                                                />
                                            ))}
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                                {/* Legend */}
                                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-4 justify-center border-t border-gray-50 mt-2">
                                    {activeWeeks.map((weekKey, i) => {
                                        const wk = availableWeeks.find(w => w.key === weekKey);
                                        return (
                                            <span key={weekKey} className="flex items-center gap-1.5 text-[11px] text-gray-600 font-semibold">
                                                <span className="w-5 h-0.5 rounded-full inline-block" style={{ backgroundColor: WEEK_COLORS[i] }} />
                                                {wk?.label}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Comparison table */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                                    <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wide">Resumen por semana</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-gray-100">
                                                <th className="text-left px-5 py-3 text-[10px] text-gray-400 uppercase tracking-widest font-bold min-w-[130px]">Métrica</th>
                                                {activeWeeks.map((weekKey, i) => {
                                                    const wk = availableWeeks.find(w => w.key === weekKey);
                                                    return (
                                                        <th key={weekKey} className="text-right px-4 py-3 min-w-[140px]">
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: WEEK_COLORS[i] }} />
                                                                <span className="text-[11px] font-bold text-gray-700 whitespace-nowrap">{wk?.label}</span>
                                                            </div>
                                                        </th>
                                                    );
                                                })}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(['ventas', 'costos', 'egresos', 'utilidad'] as const).map(metric => (
                                                <tr key={metric} className={`border-b border-gray-50 last:border-0 ${metric === 'utilidad' ? 'bg-gray-50/80' : ''}`}>
                                                    <td className={`px-5 py-3.5 ${metric === 'utilidad' ? 'font-bold text-gray-900' : 'text-gray-500 font-medium'} text-sm`}>
                                                        {metric === 'costos' ? 'Costos (COGS)' :
                                                         metric === 'egresos' ? 'Gastos Operativos' :
                                                         metric === 'utilidad' ? 'Utilidad Neta' : 'Ventas'}
                                                    </td>
                                                    {weekSummaries.map((ws, i) => {
                                                        const val = ws[metric];
                                                        const prev = i > 0 ? weekSummaries[i - 1][metric] : null;
                                                        const pct = prev !== null && prev !== 0 ? ((val - prev) / Math.abs(prev)) * 100 : null;
                                                        const isDeduction = metric === 'costos' || metric === 'egresos';
                                                        return (
                                                            <td key={ws.weekKey} className="text-right px-4 py-3.5">
                                                                <div className={`font-mono font-bold text-base ${
                                                                    metric === 'utilidad'
                                                                        ? val >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                                                        : isDeduction ? 'text-rose-500' : 'text-gray-900'
                                                                }`}>
                                                                    {isDeduction && val > 0 ? '-' : ''}₡{formatMoney(Math.abs(val))}
                                                                </div>
                                                                {pct !== null && (
                                                                    <div className={`text-[10px] font-bold mt-0.5 ${
                                                                        (isDeduction ? pct < 0 : pct > 0) ? 'text-emerald-500' : 'text-rose-500'
                                                                    }`}>
                                                                        {pct > 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% vs ant.
                                                                    </div>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Top Products Section */}
            {activeTab === 'top' && (
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
                    <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                        <TrendingUp className="text-jardin-primary" />
                        Productos Más Vendidos
                    </h2>

                    {topProducts.length === 0 ? (
                        <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-2xl">
                            Aún no hay suficientes ventas registradas para generar este reporte.
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {topProducts.map((p, i) => (
                                <div key={i} className="flex flex-col bg-gray-50 p-4 rounded-2xl border border-gray-100 relative overflow-hidden group hover:border-gray-300 transition-colors">
                                    {i < 3 && (
                                        <div className={`absolute top-0 right-0 text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow-sm ${
                                            i === 0 ? 'bg-amber-400 text-amber-900 border-b border-l border-amber-500' :
                                            i === 1 ? 'bg-gray-300 text-gray-800 border-b border-l border-gray-400' :
                                            'bg-orange-300 text-orange-900 border-b border-l border-orange-400'
                                        }`}>
                                            🏆 #{i + 1}
                                        </div>
                                    )}
                                    <h4 className="font-bold text-gray-900 pr-12 text-lg line-clamp-1 truncate" title={p.name}>{p.name}</h4>
                                    <div className="mt-4 flex justify-between items-end">
                                        <div className="text-xs text-gray-500 uppercase tracking-widest font-bold">Unidades<br/><span className="text-2xl font-black text-gray-800">{formatQty(p.qty)}</span></div>
                                        <div className="text-xs text-gray-500 uppercase tracking-widest font-bold text-right pt-1">Ingresos<br/><span className="text-xl font-black text-emerald-600 font-mono tracking-tight">₡{formatMoney(p.revenue)}</span></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
