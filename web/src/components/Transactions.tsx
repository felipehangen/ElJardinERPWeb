import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Card, cn, Input, Modal, formatMoney, formatQty } from './ui';
import { List, X, Download } from 'lucide-react';
import type { Transaction } from '../types';

// Format currency without cents
const fmt = (n: number) => formatMoney(n);

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
                        <span className="font-medium text-gray-800 capitalize">{tx.details.type === 'inventory' ? 'Inventario' : 'Activo Fijo'}</span>
                    </div>
                    {tx.details.providerName && (
                        <div className="flex justify-between text-sm border-b pb-2 border-gray-100">
                            <span className="text-gray-500">Proveedor:</span>
                            <span className="font-medium text-gray-800">{tx.details.providerName}</span>
                        </div>
                    )}
                    {tx.details.method && (
                        <div className="pt-2 text-xs text-gray-400 capitalize">Pagado con: <span className="font-bold text-gray-600">{translateMethod(tx.details.method)}</span></div>
                    )}
                </div>
            );
        case 'EXPENSE':
            return (
                <div className="bg-white border rounded-xl p-4 mt-4 space-y-3">
                    <h4 className="font-bold text-gray-800 text-sm mb-2">Detalle de Gasto</h4>
                    <div className="flex justify-between text-sm border-b pb-2 border-gray-100">
                        <span className="text-gray-500">Categoría Operativa:</span>
                        <span className="font-medium text-gray-800">{tx.details.typeName}</span>
                    </div>
                    {tx.details.detail && (
                        <div className="flex justify-between text-sm border-b pb-2 border-gray-100">
                            <span className="text-gray-500">Detalle:</span>
                            <span className="font-medium text-gray-800 text-right max-w-[70%]">{tx.details.detail}</span>
                        </div>
                    )}
                    {tx.details.provName && (
                        <div className="flex justify-between text-sm border-b pb-2 border-gray-100">
                            <span className="text-gray-500">Entidad / Proveedor:</span>
                            <span className="font-medium text-gray-800">{tx.details.provName}</span>
                        </div>
                    )}
                    {tx.details.method && (
                        <div className="pt-2 text-xs text-gray-400 capitalize">Extraído de: <span className="font-bold text-gray-600">{translateMethod(tx.details.method)}</span></div>
                    )}
                </div>
            );
        case 'PRODUCTION':
            return (
                <div className="bg-white border rounded-xl p-4 mt-4 space-y-3">
                    <h4 className="font-bold text-gray-800 text-sm mb-2">Detalle de Producción (Cocina)</h4>
                    <div className="flex justify-between text-sm bg-amber-50 p-3 rounded-lg border border-amber-100">
                        <span className="text-amber-800 font-bold">Producto Final:</span>
                        <span className="font-black text-amber-900">{tx.details.outputQty}x {tx.details.outputName}</span>
                    </div>

                    {tx.details.ingredients && tx.details.ingredients.length > 0 && (
                        <>
                            <div className="text-[10px] font-black text-gray-400 uppercase mt-4 mb-2 tracking-widest">Ingredientes Utilizados</div>
                            <div className="space-y-1">
                                {tx.details.ingredients.map((ing: any, i: number) => (
                                    <div key={i} className="flex justify-between text-xs py-1 text-gray-600 border-b border-gray-50 last:border-0">
                                        <span>{formatQty(ing.qty)}x {ing.item.name}</span>
                                        <span className="font-mono">₡{fmt(ing.qty * ing.item.cost)}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            );
        case 'ADJUSTMENT':
            return (
                <div className="bg-white border rounded-xl p-4 mt-4 space-y-3">
                    <h4 className="font-bold text-gray-800 text-sm mb-2">Dictamen de Auditoría y Ajuste</h4>

                    {tx.details.account && (
                        <div className="flex justify-between text-sm border-b pb-2 border-gray-100">
                            <span className="text-gray-500">Cuenta Rectificada:</span>
                            <span className="font-medium text-gray-800 capitalize">{tx.details.account.replace('_', ' ')}</span>
                        </div>
                    )}

                    {tx.details.itemsAdjusted !== undefined && (
                        <div className="flex justify-between text-sm border-b pb-2 border-gray-100">
                            <span className="text-gray-500">Cantidad de Artículos Alt/Baja:</span>
                            <span className="font-medium text-gray-800">{tx.details.itemsAdjusted} items</span>
                        </div>
                    )}

                    <div className="flex justify-between text-sm mt-2 items-center">
                        <span className="text-gray-500">Clasificación de Impacto:</span>
                        <span className={cn("text-xs font-bold px-2 py-1 rounded", (tx.cogs !== undefined ? tx.cogs : tx.amount) > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600")}>
                            {(tx.cogs !== undefined ? tx.cogs : tx.amount) > 0 ? '⬇ Pérdida (Gasto)' : '⬆ Superávit (Ingreso / Ganancia)'}
                        </span>
                    </div>
                </div>
            );
        default:
            return (
                <div className="bg-gray-100 p-4 rounded-xl mt-4">
                    <div className="text-xs font-bold text-gray-400 uppercase mb-2">Datos Crudos</div>
                    <pre className="text-[10px] text-gray-600 font-mono whitespace-pre-wrap break-all">{JSON.stringify(tx.details, null, 2)}</pre>
                </div>
            );
    }
};

export const Transactions = () => {
    const { transactions, revertTransaction } = useStore();
    const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

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
            const desc = tx.description.replace(/,/g, ' '); // simple escape para evitar rotura de columnas
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

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <List className="text-jardin-primary" />
                    Transacciones
                </h2>
                <button
                    onClick={handleDownloadCSV}
                    className="flex items-center gap-2 px-4 py-2 bg-jardin-primary text-white rounded-xl font-bold hover:bg-jardin-primary-dark transition-all shadow-lg shadow-jardin-primary/20"
                >
                    <Download size={18} />
                    Descargar CSV
                </button>
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
