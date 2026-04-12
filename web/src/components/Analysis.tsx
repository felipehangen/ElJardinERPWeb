import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Search, Info, TrendingUp, TrendingDown, Download, FilterX, FileText } from 'lucide-react';
import { formatMoney, formatQty } from './ui';

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

    // Main Tab State
    const [activeTab, setActiveTab] = useState<'estado' | 'tendencia' | 'top'>('estado');

    // Income Statement State
    const [statementFilter, setStatementFilter] = useState<'Ventas' | 'Costos' | 'Gastos' | 'Otros Ingresos' | 'Otros Gastos' | null>(null);

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
            return validTxs.filter(t => (t.type === 'SALE' && t.cogs && t.cogs > 0) || (t.type === 'ADJUSTMENT' && !t.voidingTxId && (t.description.toLowerCase().includes('inventario') || t.description.toLowerCase().includes('físico') || t.description.toLowerCase().includes('activos'))));
        }
        if (statementFilter === 'Otros Ingresos') {
             return validTxs.filter(t => t.type === 'ADJUSTMENT' && !t.voidingTxId && !t.description.toLowerCase().includes('inventario') && !t.description.toLowerCase().includes('físico') && !t.description.toLowerCase().includes('activos') && t.description.includes('+'));
        }
        if (statementFilter === 'Otros Gastos') {
             return validTxs.filter(t => t.type === 'ADJUSTMENT' && !t.voidingTxId && !t.description.toLowerCase().includes('inventario') && !t.description.toLowerCase().includes('físico') && !t.description.toLowerCase().includes('activos') && !t.description.includes('+'));
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
            } else if (t.type === 'ADJUSTMENT' && !t.voidingTxId) {
                const desc = t.description.toLowerCase();
                const isInv = desc.includes('inventario') || desc.includes('físico') || desc.includes('activos');
                if (isInv) {
                    asCosto += (t.cogs !== undefined ? t.cogs : t.amount);
                    isRelevant = true;
                } else {
                    if (t.description.includes('+')) {
                        asIngreso += t.amount;
                        isRelevant = true;
                    } else if (t.description.includes('-')) {
                        asGasto += t.amount;
                        isRelevant = true;
                    }
                }
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

    const activeTxs = chartData.find(d => d.date === selectedDate)?.txs || [];

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

            {/* Daily Chart Section */}
            {activeTab === 'tendencia' && (
                <div className="animate-in fade-in zoom-in-95 duration-200 space-y-6">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                        <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                            <TrendingUp className="text-jardin-primary" />
                            Tendencia de Movimientos Diarios
                        </h2>
                        
                        {chartData.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                No hay suficientes datos transaccionales para mostrar la gráfica.
                            </div>
                        ) : (
                            <div className="h-[400px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart
                                        data={chartData}
                                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                        onClick={(data: any) => {
                                            if (data && data.activeLabel) {
                                                setSelectedDate(data.activeLabel);
                                                // Scroll to details gently
                                                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                                            }
                                        }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                        <XAxis dataKey="date" tick={{ fill: '#6B7280' }} tickMargin={10} />
                                        <YAxis tickFormatter={(val) => `₡${formatMoney(val)}`} tick={{ fill: '#6B7280' }} />
                                        <Tooltip 
                                            formatter={(value: any, name: any) => [`₡${formatMoney(Number(value))}`, name]}
                                            cursor={{fill: '#F3F4F6'}}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                        <Bar dataKey="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} cursor="pointer" />
                                        <Bar dataKey="Costos" fill="#f59e0b" radius={[4, 4, 0, 0]} cursor="pointer" />
                                        <Bar dataKey="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} cursor="pointer" />
                                        <Line type="monotone" dataKey="Acumulado" stroke="#3b82f6" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                                <p className="text-xs text-gray-400 mt-4 text-center">Haz clic en alguna de las barras o fecha para ver el detalle de movimientos en la parte inferior.</p>
                            </div>
                        )}
                    </div>

                    {selectedDate && (
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 animate-in slide-in-from-bottom-4">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold flex items-center gap-2">
                                    <Search className="text-gray-400" />
                                    Movimientos del {selectedDate}
                                </h3>
                                <button 
                                    onClick={() => setSelectedDate(null)}
                                    className="text-gray-400 hover:text-gray-600 bg-gray-50 px-3 py-1 rounded-lg"
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
