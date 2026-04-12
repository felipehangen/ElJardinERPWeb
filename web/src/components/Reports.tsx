import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Card, cn, Input, formatMoney, formatQty } from './ui';
import { FileText, Box, Monitor, Wallet, X, Download } from 'lucide-react';
// Format currency without cents
const fmt = (n: number) => formatMoney(n);

// Define helper to get YTD start date
const getYTDStartDate = () => {
    const today = new Date();
    return `${today.getFullYear()}-01-01`;
};

export const Reports = () => {
    const { accounts, inventory, assets, getLedgerAccounts } = useStore();
    const ledger = getLedgerAccounts();
    const [tab, setTab] = useState<'financial' | 'inventory' | 'assets' | 'cash'>('financial');
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

    const handleDownloadCSV = () => {
        let csvContent = "";
        let filename = "";

        if (tab === 'financial') {
            filename = "Estados_Financieros.csv";
            csvContent += "ESTADO DE RESULTADOS\nConcepto,Monto (CRC)\n";
            csvContent += `Ventas Totales,${financialData.ventas}\n`;
            csvContent += `Costo de Ventas,-${financialData.costos}\n`;
            csvContent += `Utilidad Bruta,${financialData.utilidadBruta}\n`;
            csvContent += `Gastos Operativos,-${financialData.gastos}\n`;
            csvContent += `Utilidad Operativa,${financialData.utilidadOperativa}\n`;
            csvContent += `Otros Ingresos,${financialData.otrosIngresos}\n`;
            csvContent += `Otros Gastos,-${financialData.otrosGastos}\n`;
            csvContent += `Utilidad Neta,${financialData.utilidadNeta}\n\n`;

            csvContent += "BALANCE DE SITUACION\nConcepto,Monto (CRC)\n";
            csvContent += `Caja Chica,${accounts.caja_chica}\n`;
            csvContent += `Bancos,${accounts.banco}\n`;
            csvContent += `Inventario,${accounts.inventario}\n`;
            csvContent += `Activo Fijo,${accounts.activo_fijo}\n`;
            csvContent += `Total Activos,${totalActivos}\n`;
            csvContent += `Cuentas por Pagar,0\n`;
            csvContent += `Total Pasivos,0\n`;
            csvContent += `Capital Inicial,${accounts.patrimonio}\n`;
            csvContent += `Utilidad Acumulada,${utilidadNeta}\n`;
            csvContent += `Total Patrimonio,${totalPatrimonio}\n`;
        } else if (tab === 'inventory') {
            filename = "Reporte_Inventario.csv";
            csvContent += "Item,Stock,Costo Unitario (CRC),Valor Total (CRC)\n";
            filteredInventory.forEach(i => {
                csvContent += `"${i.name}",${i.stock},${i.cost},${i.stock * i.cost}\n`;
            });
            csvContent += `Total,,,${filteredInventory.reduce((acc, i) => acc + (i.stock * i.cost), 0)}\n`;
        } else if (tab === 'assets') {
            filename = "Reporte_Activos_Fijos.csv";
            csvContent += "Activo,Cantidad,Valor Total (CRC)\n";
            filteredAssets.forEach(a => {
                csvContent += `"${a.name}",${a.quantity},${a.value}\n`;
            });
            csvContent += `Total,,${filteredAssets.reduce((acc, a) => acc + a.value, 0)}\n`;
        } else if (tab === 'cash') {
            filename = "Reporte_Caja_Bancos.csv";
            csvContent += "Cuenta,Monto (CRC)\n";
            csvContent += `Caja Chica,${accounts.caja_chica}\n`;
            csvContent += `Bancos,${accounts.banco}\n`;
            csvContent += `Total Disponibilidad,${accounts.caja_chica + accounts.banco}\n`;
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            {/* Header / Tabs */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-800">Reportes</h2>
                <button
                    onClick={handleDownloadCSV}
                    className="flex items-center gap-2 px-4 py-2 bg-jardin-primary text-white rounded-xl font-bold hover:bg-jardin-primary-dark transition-all shadow-lg shadow-jardin-primary/20"
                >
                    <Download size={18} />
                    Descargar CSV
                </button>
            </div>

            <div className="flex overflow-x-auto pb-2 gap-2 bg-gray-100 p-1 rounded-xl no-print">
                {[
                    { id: 'financial', label: 'Estados Financieros', icon: FileText },
                    { id: 'inventory', label: 'Inventario', icon: Box },
                    { id: 'assets', label: 'Activos Fijos', icon: Monitor },
                    { id: 'cash', label: 'Caja y Bancos', icon: Wallet },
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
                                        <td className="p-3 text-center">{formatQty(i.stock)}</td>
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
                                        <td className="p-3 text-center">{formatQty(a.quantity)}</td>
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


        </div>
    );
};

const Row = ({ label, value, color, bold }: any) => (
    <div className={cn("flex justify-between items-center py-1", bold && "font-bold text-gray-900", color)}>
        <span className={cn(bold ? "text-base" : "text-gray-600")}>{label}</span>
        <span className="font-mono">{value < 0 ? '-' : ''}₡{fmt(Math.abs(value))}</span>
    </div>
);

