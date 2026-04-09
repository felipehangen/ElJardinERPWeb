import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Card, cn, Input, Modal } from './ui';
import { FileText, List, Box, Monitor, Wallet, X, Download } from 'lucide-react';
import type { Transaction } from '../types';

// Format currency without cents
const fmt = (n: number) => Math.round(n).toLocaleString();

// Define helper to get YTD start date
const getYTDStartDate = () => {
    const today = new Date();
    return `${today.getFullYear()}-01-01`;
};

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

export const Reports = () => {
    const { accounts, transactions, inventory, assets, getLedgerAccounts, revertTransaction } = useStore();
    const ledger = getLedgerAccounts();
    const [tab, setTab] = useState<'financial' | 'transactions' | 'inventory' | 'assets' | 'cash'>('financial');
    const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

    // Filter State
    const [filterType, setFilterType] = useState<string>('ALL');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [searchInv, setSearchInv] = useState('');
    const [searchAsset, setSearchAsset] = useState('');
    const [finStartDate, setFinStartDate] = useState(getYTDStartDate());
    const [finEndDate, setFinEndDate] = useState(''); // Empty means up to today

    if (!accounts) return <div>Cargando cuentas...</div>;

    // Derived Financial Data (Global using Ledger)
    const totalActivos = ledger.caja_chica + ledger.banco + ledger.inventario + ledger.activo_fijo;
    const utilidadBrutaGlobal = (ledger.ventas || 0) - (ledger.costos || 0);
    const utilidadNetaGlobal = utilidadBrutaGlobal - (ledger.gastos || 0) + (ledger.otrosIngresos || 0) - (ledger.otrosGastos || 0);
    const totalPatrimonio = ledger.patrimonio + utilidadNetaGlobal;

    const financialData = useMemo(() => {
        const start = finStartDate ? new Date(finStartDate + 'T00:00:00') : null;
        const end = finEndDate ? new Date(finEndDate + 'T23:59:59') : null;

        // Get ledger accounts for the specified period
        const periodLedger = getLedgerAccounts(start, end);

        const calcVentas = periodLedger.ventas || 0;
        const calcCostos = periodLedger.costos || 0;
        const calcGastos = periodLedger.gastos || 0;
        const otrosIngresos = periodLedger.otrosIngresos || 0;
        const otrosGastos = periodLedger.otrosGastos || 0;

        const utilidadBruta = calcVentas - calcCostos;
        const utilidadOperativa = utilidadBruta - calcGastos;
        const utilidadNeta = utilidadOperativa + otrosIngresos - otrosGastos;

        return {
            ventas: calcVentas,
            costos: calcCostos,
            gastos: calcGastos,
            otrosIngresos,
            otrosGastos,
            utilidadBruta,
            utilidadOperativa,
            utilidadNeta
        };
    }, [getLedgerAccounts, finStartDate, finEndDate]);

    // Use global utility for Balance Sheet equity calc (retained earnings are cumulative)
    const utilidadNeta = utilidadNetaGlobal;

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

    // Filter Inventory
    const filteredInventory = useMemo(() => {
        const filtered = inventory.filter(i => i.name.toLowerCase().includes(searchInv.toLowerCase()));
        return [...filtered].sort((a, b) => {
            if (a.stock === 0 && b.stock !== 0) return 1;
            if (a.stock !== 0 && b.stock === 0) return -1;
            return 0;
        });
    }, [inventory, searchInv]);

    // Filter Assets
    const filteredAssets = useMemo(() => {
        return assets.filter(a => a.name.toLowerCase().includes(searchAsset.toLowerCase()));
    }, [assets, searchAsset]);

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            {/* Header / Tabs */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
                <h2 className="text-2xl font-bold text-gray-800">Reportes</h2>
                <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-4 py-2 bg-jardin-primary text-white rounded-xl font-bold hover:bg-jardin-primary-dark transition-all shadow-lg shadow-jardin-primary/20"
                >
                    <Download size={18} />
                    Descargar PDF
                </button>
            </div>

            {/* Print Header */}
            <div className="hidden print:block text-center border-b pb-6 mb-8">
                <div className="text-3xl font-black text-jardin-primary mb-1">El Jardín ERP</div>
                <div className="text-sm text-gray-500 uppercase tracking-widest font-bold">Reporte Oficial de Operaciones</div>
                <div className="text-xs text-gray-400 mt-2">{new Date().toLocaleString()}</div>
            </div>

            <div className="flex overflow-x-auto pb-2 gap-2 bg-gray-100 p-1 rounded-xl no-print">
                {[
                    { id: 'financial', label: 'Estados Financieros', icon: FileText },
                    { id: 'inventory', label: 'Inventario', icon: Box },
                    { id: 'assets', label: 'Activos Fijos', icon: Monitor },
                    { id: 'cash', label: 'Caja y Bancos', icon: Wallet },
                    { id: 'transactions', label: 'Transacciones', icon: List },
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id as any)}
                        className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all whitespace-nowrap",
                            tab === t.id ? "bg-white shadow-sm text-jardin-primary" : "text-gray-500 hover:text-gray-700"
                        )}
                    >
                        <t.icon size={16} /> {t.label}
                    </button>
                ))}
            </div>

            {/* Financial Statements Tab */}
            {tab === 'financial' && (
                <div className="grid lg:grid-cols-2 gap-6">
                    {/* Income Statement */}
                    <Card className="space-y-4 border-t-4 border-t-emerald-500">
                        <div className="flex justify-between items-center border-b pb-2">
                            <div>
                                <h3 className="font-bold text-lg text-gray-800">Estado de Resultados</h3>
                                <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded">Rendimiento</span>
                            </div>
                            <div className="flex gap-2 items-center flex-wrap justify-end no-print">
                                <div className="flex items-center gap-1">
                                    <Input
                                        type="date"
                                        value={finStartDate}
                                        onChange={e => setFinStartDate(e.target.value)}
                                        className="w-auto h-9 text-xs"
                                        title="Fecha Inicio"
                                    />
                                    <span className="text-gray-400 text-xs">-</span>
                                    <Input
                                        type="date"
                                        value={finEndDate}
                                        onChange={e => setFinEndDate(e.target.value)}
                                        className="w-auto h-9 text-xs"
                                        title="Fecha Fin"
                                    />
                                </div>
                                {(finStartDate || finEndDate) && (
                                    <button
                                        onClick={() => { setFinStartDate(''); setFinEndDate(''); }}
                                        className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-red-500 transition-colors shrink-0"
                                        title="Limpiar (Ver Histórico Completo)"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="space-y-3 text-sm">
                            <Row label="(+) Ventas Totales" value={financialData.ventas} bold />
                            <Row label="(-) Costo de Ventas" value={-financialData.costos} color="text-red-500" />
                            <div className="border-t border-dashed my-2 border-emerald-500/30" />
                            <Row label="= Utilidad Bruta" value={financialData.ventas - financialData.costos} bold />
                            <Row label="(-) Gastos Operativos" value={-financialData.gastos} color="text-red-500" />

                            {(financialData.otrosIngresos > 0 || financialData.otrosGastos > 0) ? (
                                <>
                                    <div className="border-t border-dashed my-2 border-emerald-500/30" />
                                    <Row label="= Utilidad Operativa" value={financialData.utilidadOperativa} bold />
                                    {financialData.otrosIngresos > 0 && <Row label="(+) Otros Ingresos (Faltantes/Sobrantes)" value={financialData.otrosIngresos} color="text-green-600" />}
                                    {financialData.otrosGastos > 0 && <Row label="(-) Otros Gastos (Ajustes Negativos)" value={-financialData.otrosGastos} color="text-red-500" />}
                                </>
                            ) : null}

                            <div className="border-t-2 border-emerald-500 my-2 pt-2" />
                            <div className="flex justify-between items-end font-black text-xl text-jardin-primary bg-emerald-50 p-3 rounded-lg border border-emerald-200 shadow-sm">
                                <span className="text-sm font-bold uppercase text-emerald-800">Utilidad Neta</span>
                                <span>₡{fmt(financialData.utilidadNeta)}</span>
                            </div>
                        </div>
                        {(finStartDate || finEndDate) && (
                            <div className="text-xs text-center text-gray-400 mt-2">
                                Periodo: {finStartDate ? new Date(finStartDate + 'T00:00:00').toLocaleDateString() : 'Inicio'} - {finEndDate ? new Date(finEndDate + 'T23:59:59').toLocaleDateString() : 'Hoy'}
                            </div>
                        )}
                    </Card>

                    {/* Balance Sheet */}
                    <Card className="space-y-4 border-t-4 border-t-blue-500">
                        <div className="flex justify-between items-center border-b pb-2">
                            <h3 className="font-bold text-lg text-gray-800">Balance de Situación</h3>
                            <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded">Posición Actual</span>
                        </div>
                        <div className="space-y-4 text-sm">
                            <div className="bg-gray-50 p-3 rounded-xl space-y-2 shadow-sm border border-gray-100">
                                <div className="font-bold text-blue-900 uppercase text-xs mb-1">Activos (Lo que tengo)</div>
                                <Row label="Caja Chica" value={accounts.caja_chica} />
                                <Row label="Bancos" value={accounts.banco} />
                                <Row label="Inventario" value={accounts.inventario} />
                                <Row label="Activo Fijo" value={accounts.activo_fijo} />
                                <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-black text-gray-800">
                                    <span>Total Activos</span>
                                    <span>₡{fmt(totalActivos)}</span>
                                </div>
                            </div>

                            <div className="bg-gray-50 p-3 rounded-xl space-y-2 shadow-sm border border-gray-100">
                                <div className="font-bold text-red-900 uppercase text-xs mb-1">Pasivos (Lo que debo)</div>
                                <Row label="Cuentas por Pagar" value={0} color="text-gray-400" />
                                <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-black text-gray-800">
                                    <span>Total Pasivos</span>
                                    <span>₡0</span>
                                </div>
                            </div>

                            <div className="bg-gray-50 p-3 rounded-xl space-y-2 shadow-sm border border-gray-100">
                                <div className="font-bold text-emerald-900 uppercase text-xs mb-1">Patrimonio (Lo que vale)</div>
                                <Row label="Capital Inicial" value={accounts.patrimonio} />
                                <Row label="Utilidad Acumulada" value={utilidadNeta} color={utilidadNeta >= 0 ? 'text-green-600' : 'text-red-500'} />
                                <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-black text-gray-800">
                                    <span>Total Patrimonio</span>
                                    <span>₡{fmt(totalPatrimonio)}</span>
                                </div>
                            </div>

                            <div className="bg-emerald-100 p-3 rounded-xl shadow-sm border border-emerald-200">
                                <div className="flex justify-between font-black text-emerald-900 text-base">
                                    <span>Pasivo + Patrimonio</span>
                                    <span>₡{fmt(0 + totalPatrimonio)}</span>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* Inventory Tab */}
            {tab === 'inventory' && (
                <Card className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b pb-4">
                        <h3 className="font-bold text-lg">Reporte de Inventario</h3>
                        <div className="no-print">
                            <Input
                                placeholder="Buscar por nombre..."
                                value={searchInv}
                                onChange={e => setSearchInv(e.target.value)}
                                className="max-w-xs"
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-gray-500 bg-gray-50 text-xs uppercase">
                                <tr>
                                    <th className="p-3">Item</th>
                                    <th className="p-3 text-center">Stock</th>
                                    <th className="p-3 text-right">Costo Unit.</th>
                                    <th className="p-3 text-right">Valor Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredInventory.map(i => (
                                    <tr key={i.id} className={cn(
                                        "hover:bg-gray-50 transition-colors",
                                        i.stock === 0 && "text-red-600 bg-red-50/30 italic"
                                    )}>
                                        <td className="p-3 font-medium">
                                            {i.name}
                                            {i.stock === 0 && <span className="ml-2 text-[10px] font-bold uppercase tracking-tighter opacity-70">(Sin Stock)</span>}
                                        </td>
                                        <td className="p-3 text-center">{i.stock}</td>
                                        <td className="p-3 text-right">₡{fmt(i.cost)}</td>
                                        <td className="p-3 text-right font-bold">₡{fmt(i.stock * i.cost)}</td>
                                    </tr>
                                ))}
                                {filteredInventory.length === 0 && (
                                    <tr><td colSpan={4} className="p-4 text-center text-gray-400">No se encontraron artículos.</td></tr>
                                )}
                            </tbody>
                            <tfoot className="bg-gray-50 font-bold">
                                <tr>
                                    <td colSpan={3} className="p-3 text-right">Valor Total Inventario:</td>
                                    <td className="p-3 text-right text-jardin-primary">
                                        ₡{fmt(filteredInventory.reduce((acc, i) => acc + (i.stock * i.cost), 0))}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Card>
            )}

            {/* Assets Tab */}
            {tab === 'assets' && (
                <Card className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b pb-4">
                        <h3 className="font-bold text-lg">Reporte de Activos Fijos</h3>
                        <div className="no-print">
                            <Input
                                placeholder="Buscar por nombre..."
                                value={searchAsset}
                                onChange={e => setSearchAsset(e.target.value)}
                                className="max-w-xs"
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-gray-500 bg-gray-50 text-xs uppercase">
                                <tr>
                                    <th className="p-3">Activo</th>
                                    <th className="p-3 text-center">Cantidad</th>
                                    <th className="p-3 text-right">Valor Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredAssets.map(a => (
                                    <tr key={a.id} className="hover:bg-gray-50">
                                        <td className="p-3 font-medium">{a.name}</td>
                                        <td className="p-3 text-center">{a.quantity}</td>
                                        <td className="p-3 text-right font-bold">₡{fmt(a.value)}</td>
                                    </tr>
                                ))}
                                {filteredAssets.length === 0 && (
                                    <tr><td colSpan={3} className="p-4 text-center text-gray-400">No se encontraron activos.</td></tr>
                                )}
                            </tbody>
                            <tfoot className="bg-gray-50 font-bold">
                                <tr>
                                    <td colSpan={2} className="p-3 text-right">Total Activos Fijos:</td>
                                    <td className="p-3 text-right text-jardin-primary">
                                        ₡{fmt(filteredAssets.reduce((acc, a) => acc + a.value, 0))}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Card>
            )}

            {/* Cash & Banks Tab */}
            {tab === 'cash' && (
                <div className="grid md:grid-cols-2 gap-6">
                    <Card className="bg-gradient-to-br from- emerald-50 to-white border-l-4 border-l-emerald-500">
                        <div className="flex items-center gap-4 mb-2">
                            <div className="p-3 bg-emerald-100 rounded-full text-emerald-600"><Wallet /></div>
                            <div>
                                <div className="text-sm text-gray-500 uppercase font-bold">Caja Chica</div>
                                <div className="text-2xl font-black text-gray-800">₡{fmt(accounts.caja_chica)}</div>
                            </div>
                        </div>
                        <div className="text-xs text-gray-400">Efectivo disponible en caja</div>
                    </Card>

                    <Card className="bg-gradient-to-br from-blue-50 to-white border-l-4 border-l-blue-500">
                        <div className="flex items-center gap-4 mb-2">
                            <div className="p-3 bg-blue-100 rounded-full text-blue-600"><Wallet /></div>
                            <div>
                                <div className="text-sm text-gray-500 uppercase font-bold">Bancos</div>
                                <div className="text-2xl font-black text-gray-800">₡{fmt(accounts.banco)}</div>
                            </div>
                        </div>
                        <div className="text-xs text-gray-400">Fondos en cuentas bancarias</div>
                    </Card>

                    <Card className="md:col-span-2">
                        <h3 className="font-bold text-gray-500 uppercase text-xs mb-4">Total Disponibilidad (Liquidez)</h3>
                        <div className="text-4xl font-black text-jardin-primary">
                            ₡{fmt(accounts.caja_chica + accounts.banco)}
                        </div>
                    </Card>
                </div>
            )}

            {/* Transactions Tab */}
            {tab === 'transactions' && (
                <Card className="space-y-4">
                    <div className="flex flex-col md:flex-row gap-4 justify-between items-end border-b pb-4 no-print">
                        <div className="flex flex-wrap gap-4 w-full md:w-auto">
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Filtrar por Fecha</label>
                            <div className="flex gap-2">
                                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-auto" />
                                <span className="self-center text-gray-400">-</span>
                                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-auto" />
                            </div>
                        </div>

                        <div className="w-full md:w-48">
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Tipo Transacción</label>
                            <select
                                className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-jardin-primary"
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

                    <div className="max-h-[600px] overflow-y-auto rounded-xl border border-gray-100">
                        <table className="w-full text-sm text-left">
                            <thead className="text-gray-500 bg-gray-50 sticky top-0 z-10 text-xs uppercase">
                                <tr>
                                    <th className="p-3">Fecha</th>
                                    <th className="p-3">Tipo</th>
                                    <th className="p-3">Descripción</th>
                                    <th className="p-3 text-right">Monto</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredTransactions.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-gray-400">
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
                                        <td className="p-3 text-sm text-gray-500 font-medium">
                                            {new Date(t.date).toLocaleString()}
                                        </td>
                                        <td className="p-3">
                                            <span className={cn(
                                                "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider",
                                                t.status === 'VOIDED' ? "bg-gray-300 text-gray-600" : getTypeColor(t.type)
                                            )}>
                                                {t.status === 'VOIDED' ? 'ANULADA' : translateTxType(t.type)}
                                            </span>
                                        </td>
                                        <td className="p-3 font-medium text-gray-700 truncate max-w-[200px]">
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
                    <div className="text-right text-xs text-gray-400 no-print">
                        Mostrando {filteredTransactions.length} transacciones
                    </div>
                </Card>
            )}

            {/* Transaction Detail Modal */}
            {selectedTx && (
                <Modal isOpen={!!selectedTx} onClose={() => setSelectedTx(null)} title="Detalle de Transacción">
                    <div className="space-y-6">
                        <div className="flex justify-between items-center border-b pb-4">
                            <span className="text-gray-500 text-sm font-medium">{new Date(selectedTx.date).toLocaleString()}</span>
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

            {/* Print Styling */}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; margin: 0; padding: 0; }
                    .animate-in { animation: none !important; transform: none !important; }
                    main { margin: 0 !important; padding: 0 !important; }
                    .max-w-6xl { max-width: 100% !important; }
                    .Card { border: 1px solid #eee !important; box-shadow: none !important; border-top-width: 4px !important; }
                    .bg-gray-50 { background-color: #f9fafb !important; -webkit-print-color-adjust: exact; }
                    .bg-emerald-50 { background-color: #ecfdf5 !important; -webkit-print-color-adjust: exact; }
                    .bg-blue-50 { background-color: #eff6ff !important; -webkit-print-color-adjust: exact; }
                    .text-jardin-primary { color: #065f46 !important; -webkit-print-color-adjust: exact; }
                    table { page-break-inside: auto; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                    thead { display: table-header-group; }
                    tfoot { display: table-footer-group; }
                }
            `}</style>
        </div>
    );
};

const Row = ({ label, value, color, bold }: any) => (
    <div className={cn("flex justify-between items-center py-1", bold && "font-bold text-gray-900", color)}>
        <span className={cn(bold ? "text-base" : "text-gray-600")}>{label}</span>
        <span className="font-mono">{value < 0 ? '-' : ''}₡{fmt(Math.abs(value))}</span>
    </div>
);

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
                            <span className="text-gray-600">{item.qty}x {item.name}</span>
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
                        <span className="font-medium text-gray-800">{tx.details.itemName} (x{tx.details.quantity})</span>
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
                                        <span>{ing.qty}x {ing.item.name}</span>
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
