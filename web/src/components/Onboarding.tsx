import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Button, Input, Card, formatMoney, formatQty, normalizeName } from './ui';
import { AccountingActions } from '../lib/accounting';
import { Plus, Trash2, ArrowRight } from 'lucide-react';
import type { InventoryItem, AssetItem, Location, Provider } from '../types';

export const Onboarding = () => {
    const {
        updateAccounts, setInitialized,
        addInventoryItem, addAssetItem,
        addLocation, addProvider
    } = useStore();

    const [step, setStep] = useState(1);

    // Temporary State for wizard
    const [tempLocations, setTempLocations] = useState<Location[]>([]);
    const [tempProviders, setTempProviders] = useState<Provider[]>([]);
    const [tempInv, setTempInv] = useState<InventoryItem[]>([]);
    const [tempAssets, setTempAssets] = useState<AssetItem[]>([]);
    const [cash, setCash] = useState('');
    const [bank, setBank] = useState('');

    // Step 1: Inventory
    const [invForm, setInvForm] = useState({ name: '', cost: '', stock: '' });
    const addInv = () => {
        if (!invForm.name || !invForm.cost) return;
        const trimmed = invForm.name.trim();
        if (tempInv.some(i => normalizeName(i.name) === normalizeName(trimmed))) {
            alert('Ese artículo ya existe en esta lista.');
            return;
        }
        const newItem: InventoryItem = {
            id: crypto.randomUUID(),
            name: trimmed,
            cost: parseFloat(invForm.cost || '0'),
            stock: parseFloat(invForm.stock || '0') // Initial stock usually 0 or counted
        };
        setTempInv([...tempInv, newItem]);
        setInvForm({ name: '', cost: '', stock: '' });
    };

    // Step 2: Assets
    const [assetForm, setAssetForm] = useState({ name: '', unitPrice: '', quantity: '1' });
    const addAsset = () => {
        if (!assetForm.name || !assetForm.unitPrice) return;
        const trimmed = assetForm.name.trim();
        if (tempAssets.some(a => normalizeName(a.name) === normalizeName(trimmed))) {
            alert('Ese activo ya existe en esta lista.');
            return;
        }
        const qty = parseFloat(assetForm.quantity || '1');
        const unitPrice = parseFloat(assetForm.unitPrice || '0');
        const newItem: AssetItem = {
            id: crypto.randomUUID(),
            name: trimmed,
            value: unitPrice * qty,
            quantity: qty
        };
        setTempAssets([...tempAssets, newItem]);
        setAssetForm({ name: '', unitPrice: '', quantity: '1' });
    };

    // Finalize
    const finish = () => {
        // Commit all data
        tempLocations.forEach(l => addLocation(l));
        tempProviders.forEach(p => addProvider(p));
        tempInv.forEach(i => addInventoryItem(i));
        tempAssets.forEach(a => addAssetItem(a));

        const cashVal = parseFloat(cash || '0');
        const bankVal = parseFloat(bank || '0');

        // Calculate totals for accounting
        const totalInvValue = tempInv.reduce((acc, i) => acc + (i.cost * i.stock), 0);
        const totalAssetValue = tempAssets.reduce((acc, a) => acc + a.value, 0);

        const initialAccounts = AccountingActions.initializeWithEquity(cashVal, bankVal, totalInvValue, totalAssetValue);
        updateAccounts(() => initialAccounts);
        setInitialized(true);
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-jardin-bg">
            <div className="w-full max-w-2xl">
                <div className="flex flex-col items-center justify-center mb-8 text-jardin-primary gap-4">
                    <img src="logo3.png" alt="El Jardín Logo" className="w-40 h-40 object-contain" />
                    <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Bienvenido</h1>
                </div>

                {step === 1 && (
                    <Card>
                        <h2 className="text-xl font-bold mb-2">1. Ubicaciones de Inventario</h2>
                        <p className="text-sm text-gray-500 mb-6">Agregue las bodegas o lugares físicos donde guardará su mercancía.</p>

                        <div className="flex gap-2 mb-6">
                            <Input placeholder="Nombre (ej: Bodega Principal)" value={cash} onChange={e => setCash(e.target.value)} />
                            <Button onClick={() => {
                                const trimmed = cash.trim();
                                if(trimmed) {
                                    if(tempLocations.some(l => normalizeName(l.name) === normalizeName(trimmed))) {
                                        alert('Esa ubicación ya existe en esta lista.');
                                        return;
                                    }
                                    setTempLocations([...tempLocations, { id: crypto.randomUUID(), name: trimmed }]);
                                    setCash('');
                                }
                            }}><Plus size={20} /></Button>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4 min-h-[100px] max-h-[200px] overflow-y-auto space-y-2 mb-6">
                            {tempLocations.map((item, idx) => (
                                <div key={item.id} className="flex justify-between items-center text-sm bg-white p-2 rounded border">
                                    <span>{item.name}</span>
                                    <button onClick={() => setTempLocations(tempLocations.filter((_, i) => i !== idx))} className="text-red-500"><Trash2 size={16} /></button>
                                </div>
                            ))}
                            {tempLocations.length === 0 && <div className="text-center text-gray-400 py-4">Sin ubicaciones (Opcional)</div>}
                        </div>
                        <Button className="w-full" onClick={() => { setStep(2); setCash(''); }}>Siguiente: Proveedores <ArrowRight className="ml-2" size={18} /></Button>
                    </Card>
                )}

                {step === 2 && (
                    <Card>
                        <h2 className="text-xl font-bold mb-2">2. Proveedores</h2>
                        <p className="text-sm text-gray-500 mb-6">Agregue Proveedores. Muy recomendado para facilitar la <strong className="text-jardin-primary">Compra de Inventario y Compra de Activos</strong> más adelante.</p>

                        <div className="flex gap-2 mb-6">
                            <Input placeholder="Nombre (ej: Pequeño Mundo)" value={bank} onChange={e => setBank(e.target.value)} />
                            <Button onClick={() => {
                                const trimmed = bank.trim();
                                if(trimmed) {
                                    if(tempProviders.some(p => normalizeName(p.name) === normalizeName(trimmed))) {
                                        alert('Ese proveedor ya existe en esta lista.');
                                        return;
                                    }
                                    setTempProviders([...tempProviders, { id: crypto.randomUUID(), name: trimmed }]);
                                    setBank('');
                                }
                            }}><Plus size={20} /></Button>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4 min-h-[100px] max-h-[200px] overflow-y-auto space-y-2 mb-6">
                            {tempProviders.map((item, idx) => (
                                <div key={item.id} className="flex justify-between items-center text-sm bg-white p-2 rounded border">
                                    <span>{item.name}</span>
                                    <button onClick={() => setTempProviders(tempProviders.filter((_, i) => i !== idx))} className="text-red-500"><Trash2 size={16} /></button>
                                </div>
                            ))}
                            {tempProviders.length === 0 && <div className="text-center text-gray-400 py-4">Sin proveedores (Opcional)</div>}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => { setStep(1); setBank(''); setCash(''); }}>Atrás</Button>
                            <Button className="flex-1" onClick={() => { setStep(3); setBank(''); }}>Siguiente: Inventario <ArrowRight className="ml-2" size={18} /></Button>
                        </div>
                    </Card>
                )}

                {step === 3 && (
                    <Card>
                        <h2 className="text-xl font-bold mb-2">3. Inventario Inicial</h2>
                        <p className="text-sm text-gray-500 mb-6">Agregue sus artículos de inventario uno por uno. Especifique unidad en el nombre (ej: Leche 1L).</p>

                        <div className="flex gap-2 mb-2">
                            <Input placeholder="Nombre (ej: Harina 1kg)" value={invForm.name} onChange={e => setInvForm({ ...invForm, name: e.target.value })} />
                            <Input type="number" placeholder="Costo Unit." className="w-32" value={invForm.cost} onChange={e => setInvForm({ ...invForm, cost: e.target.value })} />
                            <Input type="number" placeholder="Cant." className="w-24" value={invForm.stock} onChange={e => setInvForm({ ...invForm, stock: e.target.value })} />
                            <Button onClick={addInv}><Plus size={20} /></Button>
                        </div>
                        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 mb-4">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Valor Total</span>
                            <span className="text-base font-black text-jardin-primary">
                                ₡{formatMoney(Math.round(parseFloat(invForm.stock || '0') * parseFloat(invForm.cost || '0')))}
                            </span>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-4 min-h-[150px] max-h-[300px] overflow-y-auto space-y-2 mb-6">
                            {tempInv.map((item, idx) => (
                                <div key={item.id} className="flex justify-between items-center text-sm bg-white p-2 rounded border">
                                    <span>{item.name} ({formatQty(item.stock)})</span>
                                    <div className="flex items-center gap-4">
                                        <span className="font-mono">₡{item.cost * item.stock}</span>
                                        <button onClick={() => setTempInv(tempInv.filter((_, i) => i !== idx))} className="text-red-500"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            ))}
                            {tempInv.length === 0 && <div className="text-center text-gray-400 py-8">Lista vacía</div>}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => setStep(2)}>Atrás</Button>
                            <Button className="flex-1" onClick={() => setStep(4)}>Siguiente: Activos <ArrowRight className="ml-2" size={18} /></Button>
                        </div>
                    </Card>
                )}

                {step === 4 && (
                    <Card>
                        <h2 className="text-xl font-bold mb-2">4. Activos Fijos</h2>
                        <p className="text-sm text-gray-500 mb-6">Equipos, maquinaria o mobiliario importante.</p>

                        <div className="flex gap-2 mb-2">
                            <Input placeholder="Nombre (ej: Crepera Industrial)" value={assetForm.name} onChange={e => setAssetForm({ ...assetForm, name: e.target.value })} />
                            <Input type="number" placeholder="Precio Unit." className="w-32" value={assetForm.unitPrice} onChange={e => setAssetForm({ ...assetForm, unitPrice: e.target.value })} />
                            <Input type="number" placeholder="Cant." className="w-20" value={assetForm.quantity} onChange={e => setAssetForm({ ...assetForm, quantity: e.target.value })} />
                            <Button onClick={addAsset}><Plus size={20} /></Button>
                        </div>
                        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 mb-4">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Precio Total</span>
                            <span className="text-base font-black text-jardin-primary">
                                ₡{formatMoney(Math.round(parseFloat(assetForm.quantity || '1') * parseFloat(assetForm.unitPrice || '0')))}
                            </span>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-4 min-h-[150px] max-h-[300px] overflow-y-auto space-y-2 mb-6">
                            {tempAssets.map((item, idx) => (
                                <div key={item.id} className="flex justify-between items-center text-sm bg-white p-2 rounded border">
                                    <span>{item.name} (x{formatQty(item.quantity)})</span>
                                    <div className="flex items-center gap-4">
                                        <span className="font-mono">₡{item.value}</span>
                                        <button onClick={() => setTempAssets(tempAssets.filter((_, i) => i !== idx))} className="text-red-500"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            ))}
                            {tempAssets.length === 0 && <div className="text-center text-gray-400 py-8">Sin activos</div>}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => setStep(3)}>Atrás</Button>
                            <Button className="flex-1" onClick={() => setStep(5)}>Siguiente: Efectivo <ArrowRight className="ml-2" size={18} /></Button>
                        </div>
                    </Card>
                )}

                {step === 5 && (
                    <Card>
                        <h2 className="text-xl font-bold mb-2">5. Saldos de Efectivo</h2>
                        <p className="text-sm text-gray-500 mb-6">Dinero disponible actualmente para iniciar operaciones.</p>

                        <div className="space-y-4 mb-8">
                            <div>
                                <label className="text-sm font-medium ml-1">Caja Chica (Efectivo)</label>
                                <Input type="number" value={cash} onChange={e => setCash(e.target.value)} placeholder="0" />
                            </div>
                            <div>
                                <label className="text-sm font-medium ml-1">Cuenta Bancaria</label>
                                <Input type="number" value={bank} onChange={e => setBank(e.target.value)} placeholder="0" />
                            </div>
                        </div>

                        <div className="p-4 bg-green-50 rounded-xl mb-6 text-center">
                            <div className="text-xs uppercase tracking-widest text-green-800 opacity-70 mb-1">Patrimonio Inicial Calculado</div>
                            <div className="text-3xl font-bold text-green-900">
                                ₡{formatMoney(parseFloat(cash || '0') + parseFloat(bank || '0') + tempInv.reduce((a, b) => a + b.cost * b.stock, 0) + tempAssets.reduce((a, b) => a + b.value, 0))}
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => setStep(4)}>Atrás</Button>
                            <Button className="flex-1" onClick={finish}>Iniciar El Jardín</Button>
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
};
