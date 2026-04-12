import { useRef, useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Button, Card, Input, Modal, formatMoney } from './ui';
import { Download, Upload, Trash2, RotateCcw, FolderOpen, Wallet, CheckCircle2 } from 'lucide-react';
import { SystemAuditTest } from './SystemAuditTest';
import { backupManager } from '../lib/backup';

import { getAccountingDocumentation } from '../lib/accountingDocs';
import packageJson from '../../package.json';

export const Settings = () => {
    const { importState, reset, updateAccounts, addTransaction } = useStore();
    const fileRef = useRef<HTMLInputElement>(null);

    const handleBackup = () => {
        const state = useStore.getState();

        // Extract DB version from Zustand's persist wrapper in localStorage
        const rawStorage = localStorage.getItem('jardin-erp-storage-v4');
        const dbVersion = rawStorage ? JSON.parse(rawStorage).version : 1;

        const exportPayload = {
            _metadata: {
                appVersion: packageJson.version,
                dbVersion: dbVersion,
                exportDate: new Date().toISOString()
            },
            ...state,
            documentacion_contable: getAccountingDocumentation()
        };
        const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jardin-erp-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    };

    const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);
                if (window.confirm("¿Sobrescribir datos actuales con este respaldo?")) {
                    importState(data);
                    alert("Datos restaurados.");
                }
            } catch (err) {
                alert("Error al leer archivo.");
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const [autoBackups, setAutoBackups] = useState<any[]>([]);

    useEffect(() => {
        const fetchAuto = async () => {
            if (backupManager.isElectron()) {
                setAutoBackups(await backupManager.getElectronBackups());
            } else {
                setAutoBackups(await backupManager.getIndexedDBBackups());
            }
        };
        fetchAuto();
    }, []);

    const handleDownloadAutoBackup = async (id: string, source: string) => {
        try {
            let payload = null;
            if (source === 'FILE_SYSTEM') {
                payload = await backupManager.restoreElectronBackup(id);
            } else {
                payload = await backupManager.restoreIndexedDBBackup(id);
            }

            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = id; // id is already the filename like jardin-erp-backup-YYYY-MM-DD.json
            a.click();
        } catch (e) {
            alert("Error al descargar respaldo automático.");
        }
    };

    const handleRestoreAutoBackup = async (id: string, source: string) => {
        try {
            if (window.confirm(`¿Estás seguro que deseas restaurar el sistema al día ${id}? ¡Esto borrará los datos actuales por completo!`)) {
                let payload = null;
                if (source === 'FILE_SYSTEM') {
                    payload = await backupManager.restoreElectronBackup(id);
                } else {
                    payload = await backupManager.restoreIndexedDBBackup(id);
                }
                importState(payload);
                alert("Sistema restaurado con éxito desde el respaldo automático.");
                window.location.reload();
            }
        } catch (e) {
            alert("Error al restaurar respaldo automático.");
        }
    };

    const [deleteConfirm, setDeleteConfirm] = useState('');

    const [capitalAmount, setCapitalAmount] = useState('');
    const [capitalAccount, setCapitalAccount] = useState<'banco' | 'caja_chica'>('banco');
    const [successMsg, setSuccessMsg] = useState<{ amount: number, account: string } | null>(null);

    const handleCapitalContribution = () => {
        const amount = parseFloat(capitalAmount);
        if (isNaN(amount) || amount <= 0) {
            alert("Monto inválido");
            return;
        }

        updateAccounts(prev => ({
            ...prev,
            [capitalAccount]: prev[capitalAccount] + amount,
            patrimonio: prev.patrimonio + amount
        }));

        addTransaction({
            id: crypto.randomUUID(),
            type: 'INITIALIZATION',
            date: new Date().toISOString(),
            amount: amount,
            description: `Aporte de Capital (${capitalAccount === 'banco' ? 'Banco' : 'Caja Chica'})`
        });

        setSuccessMsg({ amount, account: capitalAccount });
        setCapitalAmount('');
    };

    return (
        <Card className="max-w-xl mx-auto space-y-8">
            <div>
                <h3 className="font-bold text-lg mb-4">Gestión de Datos</h3>
                <div className="flex gap-4">
                    <Button onClick={handleBackup} className="flex-1 bg-sky-600 hover:bg-sky-700">
                        <Download className="mr-2" size={18} /> Descargar Respaldo
                    </Button>
                    <Button variant="outline" onClick={() => fileRef.current?.click()} className="flex-1">
                        <Upload className="mr-2" size={18} /> Importar Respaldo
                    </Button>
                    <input type="file" ref={fileRef} onChange={handleRestore} accept=".json" className="hidden" />
                </div>
            </div>

            <div className="pt-8 border-t">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-lg">Copias de Seguridad Automáticas</h3>
                    {backupManager.isElectron() && (
                        <Button variant="outline" size="sm" onClick={() => backupManager.openElectronBackupFolder()} className="h-8 text-xs shrink-0">
                            <FolderOpen className="mr-1.5" size={14} /> Abrir Carpeta
                        </Button>
                    )}
                </div>
                <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
                    {autoBackups.length === 0 ? (
                        <p className="text-gray-500 text-xs bg-gray-50 p-3 rounded-md">Aún no hay respaldos automáticos. El sistema tomará una foto invisible de la base de datos una vez al día.</p>
                    ) : (
                        autoBackups.map(bkp => (
                            <div key={bkp.id} className="flex flex-wrap sm:flex-nowrap items-center justify-between py-1.5 px-2 bg-gray-50/50 hover:bg-white border text-sm rounded transition-colors group">
                                <span className="font-medium text-gray-700 w-24 shrink-0">{bkp.date}</span>
                                <span className="text-xs text-gray-400 font-mono truncate px-2">{bkp.id}</span>
                                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button size="icon" variant="ghost" onClick={() => handleDownloadAutoBackup(bkp.id, bkp.source)} className="h-7 w-7 text-gray-400 hover:text-sky-600">
                                        <Download size={14} />
                                    </Button>
                                    <Button size="icon" variant="ghost" onClick={() => handleRestoreAutoBackup(bkp.id, bkp.source)} className="h-7 w-7 text-gray-400 hover:text-red-600">
                                        <RotateCcw size={14} />
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="pt-8 border-t">
                <h3 className="font-bold text-lg mb-4">Aportes de Capital</h3>
                <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 flex flex-col gap-4">
                    <p className="text-xs text-emerald-800/80">
                        Registra inyecciones de nuevo capital al negocio. Esto incrementará tus fondos disponibles y tu Patrimonio contable simultáneamente.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                        <div className="flex-1 w-full relative">
                            <label className="text-[10px] font-bold text-emerald-700 uppercase block mb-1">Monto (₡)</label>
                            <Input
                                type="number"
                                value={capitalAmount}
                                onChange={e => setCapitalAmount(e.target.value)}
                                placeholder="Ej: 50000"
                                className="bg-white border-emerald-200 focus:border-emerald-500 h-10 relative z-10 py-2"
                            />
                        </div>
                        <div className="flex-1 w-full relative h-[60px] sm:h-auto">
                            <label className="text-[10px] font-bold text-emerald-700 uppercase block mb-1 absolute sm:relative top-0 left-0">Destino</label>
                            <select
                                className="w-full h-10 px-3 bg-white border border-emerald-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 absolute sm:relative bottom-0 left-0"
                                value={capitalAccount}
                                onChange={(e: any) => setCapitalAccount(e.target.value)}
                            >
                                <option value="banco">Bancos</option>
                                <option value="caja_chica">Caja Chica</option>
                            </select>
                        </div>
                        <Button onClick={handleCapitalContribution} className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto shrink-0 flex items-center justify-center whitespace-nowrap h-10 px-6 font-bold mt-1 sm:mt-0 shadow-sm text-sm">
                            <Wallet className="mr-2" size={18} /> Registrar
                        </Button>
                    </div>
                </div>
            </div>

            <div className="pt-8 border-t">
                <h3 className="font-bold text-red-600 mb-4">Zona de Peligro</h3>
                <div className="bg-red-50 p-4 rounded-xl space-y-4 border border-red-100">
                    <p className="text-sm text-red-800">
                        Esta acción borrará <strong>todos</strong> los datos y no se puede deshacer.
                        Escribe <strong>BORRAR</strong> para confirmar.
                    </p>
                    <div className="flex gap-2">
                        <Input
                            value={deleteConfirm}
                            onChange={e => setDeleteConfirm(e.target.value)}
                            placeholder='Escribe "BORRAR"'
                            className="bg-white border-red-200 focus:border-red-500 focus:ring-red-200"
                        />
                        <Button
                            variant="danger"
                            disabled={deleteConfirm !== 'BORRAR'}
                            onClick={() => {
                                try {
                                    reset();
                                    window.localStorage.clear();
                                    window.localStorage.removeItem('jardin-erp-storage-v4');
                                    alert('¡Datos eliminados correctamente! El sistema se reiniciará.');
                                    setTimeout(() => window.location.reload(), 500);
                                } catch (e) {
                                    alert('Error eliminando datos: ' + e);
                                }
                            }}
                        >
                            <Trash2 className="mr-2" size={18} /> Reiniciar de Fábrica
                        </Button>
                    </div>
                </div>
            </div>

            <div className="pt-8 border-t">
                <SystemAuditTest />
            </div>

            <Modal isOpen={!!successMsg} onClose={() => setSuccessMsg(null)}>
                <div className="text-center py-6 px-4">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-sm">
                        <CheckCircle2 className="text-jardin-primary w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 mb-2">¡Aporte Registrado!</h2>
                    <p className="text-gray-500 mb-6">
                        El aporte de capital se materializó e impactó las cuentas correctamente.
                    </p>

                    <div className="bg-gray-50 rounded-2xl p-4 mb-6 border border-gray-100">
                        <div className="flex justify-between items-center py-2 border-b border-gray-200/50 last:border-0">
                            <span className="text-sm text-gray-500 font-medium">Monto del Aporte</span>
                            <span className="font-bold text-gray-900">₡{formatMoney(successMsg?.amount || 0)}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-gray-200/50 last:border-0">
                            <span className="text-sm text-gray-500 font-medium">Cuenta Destino</span>
                            <span className="font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded text-sm">
                                {successMsg?.account === 'banco' ? 'Bancos' : 'Caja Chica'}
                            </span>
                        </div>
                    </div>

                    <Button onClick={() => setSuccessMsg(null)} className="w-full text-lg py-6 bg-jardin-primary hover:bg-green-700 shadow-md">
                        Entendido
                    </Button>
                </div>
            </Modal>
        </Card>
    );
};
