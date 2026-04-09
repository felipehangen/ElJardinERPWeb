import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Button, Input, Card, Modal, cn } from './ui';
import { Trash2, Plus, Box, Tag, Users, FileText } from 'lucide-react';

export const Catalogs = () => {
    const {
        inventory, products, providers, expenseTypes,
        addInventoryItem, updateInventoryItem, deleteInventoryItem,
        addProduct, updateProduct, deleteProduct,
        addProvider, updateProvider, deleteProvider,
        addExpenseType, updateExpenseType, deleteExpenseType,
    } = useStore();

    const [activeTab, setActiveTab] = useState<'inv' | 'prod' | 'prov' | 'exp'>('inv');

    // Forms
    const [invForm, setInvForm] = useState({ name: '', cost: '' });
    const [prodForm, setProdForm] = useState({ name: '', price: '' });
    const [provForm, setProvForm] = useState('');
    const [expForm, setExpForm] = useState('');
    const [pendingHide, setPendingHide] = useState<{ id: string, type: 'inv' | 'prod' | 'prov' | 'exp' } | null>(null);
    const [duplicateError, setDuplicateError] = useState<string | null>(null);


    const Tabs = () => (
        <div className="flex gap-2 overflow-x-auto pb-2">
            {[
                { id: 'inv', label: 'Inventario', icon: Box },
                { id: 'prod', label: 'Productos Venta', icon: Tag },
                { id: 'prov', label: 'Proveedores', icon: Users },
                { id: 'exp', label: 'Tipos de Gasto', icon: FileText },
            ].map(t => (
                <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id as any)}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors border",
                        activeTab === t.id
                            ? "bg-white border-jardin-primary text-jardin-primary shadow-sm"
                            : "bg-transparent border-transparent text-gray-500 hover:bg-white hover:border-gray-200"
                    )}
                >
                    <t.icon size={16} />
                    {t.label}
                </button>
            ))}
        </div>
    );

    return (
        <>
            <div className="space-y-6">
                <h2 className="text-2xl font-bold">Catálogos</h2>
                <Tabs />

                {/* Inventory */}
                {activeTab === 'inv' && (() => {
                    const visibleItems = inventory.filter(i => !i.hidden).sort((a, b) => a.name.localeCompare(b.name));
                    const hiddenItems = inventory.filter(i => i.hidden).sort((a, b) => a.name.localeCompare(b.name));

                    const handleDeleteOrHide = (id: string) => {
                        const txs = useStore.getState().transactions;
                        const hasMovements = txs.some(tx =>
                            (tx.details?.ingredients as any[])?.some((ing: any) => ing.item?.id === id) ||
                            tx.details?.outputId === id ||
                            tx.details?.itemId === id
                        ) || inventory.find(i => i.id === id)?.batches?.length;

                        if (hasMovements) {
                            setPendingHide({ id, type: 'inv' });
                        } else {
                            deleteInventoryItem(id);
                        }
                    };

                    return (
                        <div className="space-y-4">
                            <Card>
                                <h3 className="font-bold mb-4">Nuevo Artículo de Inventario</h3>
                                <div className="flex gap-4">
                                    <Input placeholder="Nombre + Unidad (ej: Arroz 1kg)" value={invForm.name} onChange={e => setInvForm({ ...invForm, name: e.target.value })} />
                                    <Input type="number" placeholder="Costo Estándar" className="w-40" value={invForm.cost} onChange={e => setInvForm({ ...invForm, cost: e.target.value })} />
                                    <Button onClick={() => {
                                        if (!invForm.name || !invForm.cost) return;
                                        const trimmedName = invForm.name.trim();
                                        if (inventory.some(i => i.name.toLowerCase() === trimmedName.toLowerCase())) {
                                            setDuplicateError('Ese artículo de inventario ya existe.');
                                            return;
                                        }
                                        addInventoryItem({ id: crypto.randomUUID(), name: trimmedName, cost: parseFloat(invForm.cost || '0'), stock: 0 });
                                        setInvForm({ name: '', cost: '' });
                                    }}><Plus size={20} /></Button>
                                </div>
                            </Card>
                            <div className="bg-white rounded-xl border border-gray-100 divide-y">
                                {visibleItems.length === 0 && (
                                    <div className="p-6 text-center text-gray-400 text-sm italic">Sin artículos en inventario</div>
                                )}
                                {visibleItems.map(i => (
                                    <div key={i.id} className="p-4 flex justify-between items-center text-sm">
                                        <span className="font-medium">{i.name}</span>
                                        <div className="flex items-center gap-4 text-gray-500">
                                            <span>Ref: ₡{i.cost}</span>
                                            <button
                                                title="Eliminar o esconder artículo"
                                                onClick={() => handleDeleteOrHide(i.id)}
                                                className="text-gray-300 hover:text-red-500"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Hidden Items Section */}
                            {hiddenItems.length > 0 && (
                                <details className="group">
                                    <summary className="cursor-pointer text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2 py-2 select-none">
                                        <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                                        Artículos Escondidos ({hiddenItems.length})
                                    </summary>
                                    <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 divide-y mt-2">
                                        {hiddenItems.map(i => (
                                            <div key={i.id} className="p-4 flex justify-between items-center text-sm text-gray-400">
                                                <span className="line-through">{i.name}</span>
                                                <button
                                                    title="Restaurar artículo"
                                                    onClick={() => updateInventoryItem(i.id, { hidden: false })}
                                                    className="text-xs text-jardin-primary hover:underline font-medium"
                                                >
                                                    Restaurar
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>
                    );
                })()}

                {/* Products */}
                {activeTab === 'prod' && (() => {
                    const visibleProducts = products.filter(p => !p.hidden).sort((a, b) => a.name.localeCompare(b.name));
                    const hiddenProducts = products.filter(p => p.hidden).sort((a, b) => a.name.localeCompare(b.name));

                    const handleDeleteOrHideProd = (id: string) => {
                        const txs = useStore.getState().transactions;
                        const hasMovements = txs.some(tx => tx.type === 'SALE' && tx.details?.cart?.some((c: any) => c.id === id));
                        if (hasMovements) setPendingHide({ id, type: 'prod' });
                        else deleteProduct(id);
                    };

                    return (
                        <div className="space-y-4">
                            <Card>
                                <h3 className="font-bold mb-4">Nuevo Producto</h3>
                                <div className="flex gap-4">
                                    <Input placeholder="Nombre (ej: Casado Pollo)" value={prodForm.name} onChange={e => setProdForm({ ...prodForm, name: e.target.value })} />
                                    <Input type="number" placeholder="Precio Venta" className="w-40" value={prodForm.price} onChange={e => setProdForm({ ...prodForm, price: e.target.value })} />
                                    <Button onClick={() => {
                                        if (!prodForm.name || !prodForm.price) return;
                                        const trimmedName = prodForm.name.trim();
                                        if (products.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
                                            setDuplicateError('Ese producto de venta ya existe.');
                                            return;
                                        }
                                        addProduct({ id: crypto.randomUUID(), name: trimmedName, price: parseFloat(prodForm.price || '0') });
                                        setProdForm({ name: '', price: '' });
                                    }}><Plus size={20} /></Button>
                                </div>
                            </Card>
                            <div className="bg-white rounded-xl border border-gray-100 divide-y">
                                {visibleProducts.length === 0 && (
                                    <div className="p-6 text-center text-gray-400 text-sm italic">Sin productos registrados</div>
                                )}
                                {visibleProducts.map(i => (
                                    <div key={i.id} className="p-4 flex flex-wrap justify-between items-start gap-y-1 text-sm">
                                        <input value={i.name} onChange={e => updateProduct(i.id, { name: e.target.value })} className="font-medium bg-transparent focus:underline outline-none min-w-0 flex-1 break-words" />
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-xs text-gray-400">₡</span>
                                            <input
                                                type="number"
                                                value={i.price}
                                                onChange={e => updateProduct(i.id, { price: parseFloat(e.target.value) })}
                                                className="w-24 text-right bg-transparent border-b border-gray-100 focus:border-jardin-primary outline-none"
                                            />
                                            <button onClick={() => handleDeleteOrHideProd(i.id)} className="text-gray-300 hover:text-red-500 ml-2"><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {hiddenProducts.length > 0 && (
                                <details className="group">
                                    <summary className="cursor-pointer text-sm font-bold text-gray-500 mb-2 list-none flex items-center gap-2">
                                        <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                                        Productos Ocultos ({hiddenProducts.length})
                                    </summary>
                                    <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 divide-y mt-2">
                                        {hiddenProducts.map(i => (
                                            <div key={i.id} className="p-4 flex justify-between items-center text-sm text-gray-400">
                                                <span className="line-through">{i.name}</span>
                                                <button
                                                    title="Restaurar producto"
                                                    onClick={() => updateProduct(i.id, { hidden: false })}
                                                    className="text-xs text-jardin-primary hover:underline font-medium"
                                                >
                                                    Restaurar
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>
                    );
                })()}

                {/* Providers */}
                {activeTab === 'prov' && (() => {
                    const visibleProviders = providers.filter(p => !p.hidden).sort((a, b) => a.name.localeCompare(b.name));
                    const hiddenProviders = providers.filter(p => p.hidden).sort((a, b) => a.name.localeCompare(b.name));

                    const handleDeleteOrHideProv = (id: string, name: string) => {
                        const txs = useStore.getState().transactions;
                        const hasMovements = txs.some(tx => tx.type === 'PURCHASE' && tx.details?.providerName === name);
                        if (hasMovements) setPendingHide({ id, type: 'prov' });
                        else deleteProvider(id);
                    };

                    return (
                        <div className="space-y-4">
                            <Card>
                                <h3 className="font-bold mb-4">Nuevo Proveedor</h3>
                                <div className="flex gap-4">
                                    <Input placeholder="Nombre Empresa / Persona" value={provForm} onChange={e => setProvForm(e.target.value)} />
                                    <Button onClick={() => {
                                        if (!provForm) return;
                                        const trimmedName = provForm.trim();
                                        if (providers.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
                                            setDuplicateError('Ese proveedor ya existe.');
                                            return;
                                        }
                                        addProvider({ id: crypto.randomUUID(), name: trimmedName });
                                        setProvForm('');
                                    }}><Plus size={20} /></Button>
                                </div>
                            </Card>
                            <div className="bg-white rounded-xl border border-gray-100 divide-y">
                                {visibleProviders.length === 0 && (
                                    <div className="p-6 text-center text-gray-400 text-sm italic">Sin proveedores registrados</div>
                                )}
                                {visibleProviders.map(i => (
                                    <div key={i.id} className="p-4 flex justify-between items-center text-sm">
                                        <span>{i.name}</span>
                                        <button onClick={() => handleDeleteOrHideProv(i.id, i.name)} className="text-gray-300 hover:text-red-500"><Trash2 size={16} /></button>
                                    </div>
                                ))}
                            </div>

                            {hiddenProviders.length > 0 && (
                                <details className="group">
                                    <summary className="cursor-pointer text-sm font-bold text-gray-500 mb-2 list-none flex items-center gap-2">
                                        <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                                        Proveedores Ocultos ({hiddenProviders.length})
                                    </summary>
                                    <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 divide-y mt-2">
                                        {hiddenProviders.map(i => (
                                            <div key={i.id} className="p-4 flex justify-between items-center text-sm text-gray-400">
                                                <span className="line-through">{i.name}</span>
                                                <button
                                                    title="Restaurar proveedor"
                                                    onClick={() => updateProvider(i.id, { hidden: false })}
                                                    className="text-xs text-jardin-primary hover:underline font-medium"
                                                >
                                                    Restaurar
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>
                    );
                })()}

                {/* Expense Types */}
                {activeTab === 'exp' && (() => {
                    const visibleExpenseTypes = expenseTypes.filter(e => !e.hidden).sort((a, b) => a.name.localeCompare(b.name));
                    const hiddenExpenseTypes = expenseTypes.filter(e => e.hidden).sort((a, b) => a.name.localeCompare(b.name));

                    const handleDeleteOrHideExp = (id: string, name: string) => {
                        const txs = useStore.getState().transactions;
                        const hasMovements = txs.some(tx => tx.type === 'EXPENSE' && tx.details?.typeName === name);
                        if (hasMovements) setPendingHide({ id, type: 'exp' });
                        else deleteExpenseType(id);
                    };

                    return (
                        <div className="space-y-4">
                            <Card>
                                <h3 className="font-bold mb-4">Tipos de Gasto</h3>
                                <div className="flex gap-4">
                                    <Input placeholder="Nombre (ej: Servicios públicos, Publicidad)" value={expForm} onChange={e => setExpForm(e.target.value)} />
                                    <Button onClick={() => {
                                        if (!expForm) return;
                                        const trimmedName = expForm.trim();
                                        if (expenseTypes.some(e => e.name.toLowerCase() === trimmedName.toLowerCase())) {
                                            setDuplicateError('Ese tipo de gasto ya existe.');
                                            return;
                                        }
                                        addExpenseType({ id: crypto.randomUUID(), name: trimmedName });
                                        setExpForm('');
                                    }}><Plus size={20} /></Button>
                                </div>
                            </Card>
                            <div className="bg-white rounded-xl border border-gray-100 divide-y">
                                {visibleExpenseTypes.length === 0 && (
                                    <div className="p-6 text-center text-gray-400 text-sm italic">Sin tipos de gasto registrados</div>
                                )}
                                {visibleExpenseTypes.map(i => (
                                    <div key={i.id} className="p-4 flex justify-between items-center text-sm">
                                        <span>{i.name}</span>
                                        <button onClick={() => handleDeleteOrHideExp(i.id, i.name)} className="text-gray-300 hover:text-red-500"><Trash2 size={16} /></button>
                                    </div>
                                ))}
                            </div>

                            {hiddenExpenseTypes.length > 0 && (
                                <details className="group">
                                    <summary className="cursor-pointer text-sm font-bold text-gray-500 mb-2 list-none flex items-center gap-2">
                                        <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                                        Tipos de Gasto Ocultos ({hiddenExpenseTypes.length})
                                    </summary>
                                    <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 divide-y mt-2">
                                        {hiddenExpenseTypes.map(i => (
                                            <div key={i.id} className="p-4 flex justify-between items-center text-sm text-gray-400">
                                                <span className="line-through">{i.name}</span>
                                                <button
                                                    title="Restaurar tipo de gasto"
                                                    onClick={() => updateExpenseType(i.id, { hidden: false })}
                                                    className="text-xs text-jardin-primary hover:underline font-medium"
                                                >
                                                    Restaurar
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>
                    );
                })()}

            </div>

            {/* Hide Confirmation Modal */}
            <Modal
                isOpen={!!pendingHide}
                onClose={() => setPendingHide(null)}
                title="No se puede eliminar"
            >
                <div className="space-y-4">
                    <div className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <span className="text-amber-500 text-xl">⚠️</span>
                        <div className="text-sm text-amber-800 space-y-2">
                            <p className="font-semibold">Este registro tiene movimientos contables asociados.</p>
                            <p>Para mantener la integridad del historial contable, no se puede eliminar permanentemente.</p>
                            <p>En su lugar, se puede <strong>esconder</strong> del catálogo activo. Podrá restaurarlo en cualquier momento desde la sección de elementos ocultos.</p>
                        </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <Button variant="ghost" onClick={() => setPendingHide(null)} className="flex-1">Cancelar</Button>
                        <Button onClick={() => {
                            if (pendingHide?.type === 'inv') updateInventoryItem(pendingHide.id, { hidden: true });
                            if (pendingHide?.type === 'prod') updateProduct(pendingHide.id, { hidden: true });
                            if (pendingHide?.type === 'prov') updateProvider(pendingHide.id, { hidden: true });
                            if (pendingHide?.type === 'exp') updateExpenseType(pendingHide.id, { hidden: true });
                            setPendingHide(null);
                        }} className="flex-1">Esconder Registro</Button>
                    </div>
                </div>
            </Modal>

            {/* General Duplicate Error Modal */}
            <Modal
                isOpen={!!duplicateError}
                onClose={() => setDuplicateError(null)}
                title="Atención"
            >
                <div className="space-y-4">
                    <div className="bg-amber-50 p-4 rounded-xl text-center border border-amber-200">
                        <h3 className="text-lg font-bold text-amber-900 mb-1">Registro Duplicado</h3>
                        <p className="text-base font-medium text-amber-800 mb-1">{duplicateError}</p>
                        <p className="text-sm text-amber-700">Por favor, utiliza un nombre diferente para evitar confusiones.</p>
                    </div>
                    <Button className="w-full" onClick={() => setDuplicateError(null)}>Entendido</Button>
                </div>
            </Modal>
        </>
    );
};
