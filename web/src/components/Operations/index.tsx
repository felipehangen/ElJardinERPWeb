import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Button, Input, Modal, Combobox, cn, formatMoney, formatQty, normalizeName } from '../ui';
import { Trash2 } from 'lucide-react';
import { AccountingActions } from '../../lib/accounting';
import { AccountingFeedback } from '../AccountingFeedback';

// Shared Payment Selector
const PaymentMethod = ({ value, onChange }: any) => (
    <div className="flex gap-2">
        <button type="button" onClick={() => onChange('caja_chica')} className={cn("flex-1 py-3 px-4 rounded-xl border-2 font-medium transition-all text-sm", value === 'caja_chica' ? "border-jardin-primary bg-green-50 text-jardin-primary" : "border-gray-200 text-gray-500")}>Caja Chica</button>
        <button type="button" onClick={() => onChange('banco')} className={cn("flex-1 py-3 px-4 rounded-xl border-2 font-medium transition-all text-sm", value === 'banco' ? "border-jardin-primary bg-green-50 text-jardin-primary" : "border-gray-200 text-gray-500")}>Banco</button>
    </div>
);

const ConfirmDialog = ({ isOpen, onClose, onConfirm, title, data }: any) => {
    if (!isOpen) return null;
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <div className="space-y-4">
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-amber-800 text-sm flex gap-3 items-center">
                    <span className="text-xl">⚠️</span>
                    <p className="font-medium">Por favor verifique los datos antes de registrar la operación.</p>
                </div>
                <div className="space-y-2 border rounded-2xl p-4 bg-gray-50/50">
                    {data.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                            <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">{item.label}</span>
                            <span className={cn("font-bold text-gray-900", item.highlight && "text-jardin-primary text-lg")}>{item.value}</span>
                        </div>
                    ))}
                </div>
                <div className="flex gap-3 pt-2">
                    <Button variant="ghost" onClick={onClose} className="flex-1">Corregir</Button>
                    <Button onClick={onConfirm} className="flex-1">Confirmar</Button>
                </div>
            </div>
        </Modal>
    );
};

// 1. Purchase (Inventario/Activo)
export const PurchaseModal = ({ isOpen, onClose }: any) => {
    const {
        accounts, updateAccounts, addTransaction,
        inventory, addInventoryItem, updateInventoryItem,
        addAssetItem,
        providers, addProvider,
        getLedgerAccounts
    } = useStore();

    const [tab, setTab] = useState<'inventory' | 'asset'>('inventory');
    const [form, setForm] = useState({ itemId: '', itemName: '', unitPrice: '', quantity: '1', method: 'caja_chica', provId: '' });
    const [tempProvName, setTempProvName] = useState('');

    // Smart Create State
    const [isCreating, setIsCreating] = useState(false);
    const [newItem, setNewItem] = useState({ name: '', cost: '' });

    // Confirmation State
    const [isConfirming, setIsConfirming] = useState(false);
    const [duplicateError, setDuplicateError] = useState<string | null>(null);

    // Feedback State
    const [feedback, setFeedback] = useState<{ isOpen: boolean, prev: any, curr: any, description?: string }>({ isOpen: false, prev: null, curr: null, description: '' });

    // Handlers needed for Combobox to Quick Create
    const handleCreateInv = (name: string) => {
        // Prevent duplicates by checking if case-insensitive name exists
        const existing = inventory.find(i => normalizeName(i.name) === normalizeName(name));
        if (existing) {
            setForm(prev => ({ ...prev, itemId: existing.id, itemName: existing.name }));
            return;
        }

        // Intercept: Don't create yet. Open sub-dialog.
        setNewItem({ name, cost: '' });
        setIsCreating(true);
    };

    const confirmCreateInv = () => {
        if (!newItem.name) return;
        const trimmedName = newItem.name.trim();
        if (inventory.some(i => normalizeName(i.name) === normalizeName(trimmedName))) {
            setDuplicateError('Ese artículo ya existe en el catálogo.');
            return;
        }
        const id = crypto.randomUUID();
        const cost = parseFloat(newItem.cost || '0');

        // 1. Create Inventory Item
        addInventoryItem({ id, name: newItem.name, cost, stock: 0 });

        // 2. Select it in form
        setForm(prev => ({ ...prev, itemId: id, itemName: newItem.name }));
        setIsCreating(false);
        setNewItem({ name: '', cost: '' });
    };

    const handleCreateProv = (name: string) => {
        const id = crypto.randomUUID();
        addProvider({ id, name });
        setForm(prev => ({ ...prev, provId: id }));
    };

    const handleSubmit = () => {
        const qty = parseFloat(form.quantity || '1');
        const unitPrice = parseFloat(form.unitPrice || '0');
        const amount = qty * unitPrice;

        if (amount < 0 || !form.itemName) return;

        // Auto-creation check
        if (tab === 'inventory' && !form.itemId) {
            handleCreateInv(form.itemName);
            return;
        }

        setIsConfirming(true);
    };

    const executeSubmit = () => {
        setIsConfirming(false);

        // NEW: Auto-create provider if typed but not selected
        let finalProvId = form.provId;
        if (!finalProvId && tempProvName.trim()) {
            const existing = providers.find(p => normalizeName(p.name) === normalizeName(tempProvName));
            if (existing) {
                finalProvId = existing.id;
            } else {
                finalProvId = crypto.randomUUID();
                addProvider({ id: finalProvId, name: tempProvName });
            }
        }

        const quantity = parseFloat(form.quantity || '1');
        const unitPrice = parseFloat(form.unitPrice || '0');
        const amount = quantity * unitPrice;

        if (amount < 0 && tab === 'inventory') return; // Extra safety

        const prevLedger = { ...accounts, ...getLedgerAccounts() }; // Capture snapshot
        let newAccounts = accounts;
        if (tab === 'inventory') {
            newAccounts = AccountingActions.purchaseInventory(accounts, amount, form.method as any);

            // Update Inventory Stock & Cost (FIFO Appending)
            if (form.itemId && quantity > 0) {
                const item = inventory.find(i => i.id === form.itemId);
                if (item) {
                    const newBatch = {
                        id: crypto.randomUUID(),
                        date: new Date().toISOString(),
                        stock: quantity,
                        cost: amount / quantity
                    };

                    const existingBatches = item.batches && item.batches.length > 0 ? [...item.batches] : [{
                        id: 'legacy-' + crypto.randomUUID(),
                        date: new Date(0).toISOString(),
                        cost: item.cost,
                        stock: item.stock
                    }];

                    const oldVal = item.cost * item.stock;
                    const purchaseVal = amount; // Total spent
                    const newStock = item.stock + quantity;
                    const newAvgCost = (oldVal + purchaseVal) / newStock;

                    updateInventoryItem(form.itemId, {
                        stock: newStock,
                        cost: newAvgCost,
                        batches: [...existingBatches, newBatch]
                    });
                }
            }
        } else {
            newAccounts = AccountingActions.purchaseAsset(accounts, amount, form.method as any);

            // Asset Logic
            if (quantity > 0) {
                // Check if asset exists (simple check by name for now, or just always add new?)
                // Simplification: Always add NEW asset record for each purchase batch, or grouping?
                // Plan says: "Update Asset definition to include quantity".
                // So we should see if we selected an existing Asset ID (not yet implemented in UI selector for Assets),
                // OR create a new one.
                // The currrent UI for Asset is just "Description" (Text Input).
                // So we create a NEW Asset Item.
                addAssetItem({
                    id: crypto.randomUUID(),
                    name: form.itemName,
                    value: amount, // Total Value
                    quantity: quantity
                });
            }
        }

        const targetProvider = providers?.find(p => p.id === (finalProvId || form.provId))?.name || tempProvName;

        updateAccounts(() => newAccounts);
        addTransaction({
            id: crypto.randomUUID(), type: 'PURCHASE', date: new Date().toISOString(), amount,
            description: `Compra ${tab === 'inventory' ? 'Inventario' : 'Activo'}: ${form.itemName} (x${formatQty(quantity)})`,
            details: { itemName: form.itemName, quantity, method: form.method, type: tab, providerName: targetProvider }
        });

        const freshState = useStore.getState();
        const currLedger = { ...freshState.accounts, ...freshState.getLedgerAccounts() };

        // Trigger Feedback instead of closing immediately
        setFeedback({ isOpen: true, prev: prevLedger as any, curr: currLedger as any, description: `Compraste: ${form.itemName} (x${formatQty(quantity)})` });
        setForm({ itemId: '', itemName: '', unitPrice: '', quantity: '1', method: 'caja_chica', provId: '' });
        setTempProvName('');
    };

    const closeAll = () => {
        setFeedback({ isOpen: false, prev: null, curr: null, description: '' });
        setIsConfirming(false);
        onClose();
    };

    return (
        <>
            <Modal isOpen={isOpen && !feedback.isOpen && !isConfirming} onClose={onClose} title="Registrar Compra">
                {isCreating ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <h3 className="font-bold text-blue-900 mb-2">Nuevo Artículo de Inventario</h3>
                            <p className="text-xs text-blue-700 mb-4">Especifique unidad en el nombre (ej: Leche 1L)</p>

                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Nombre Descriptivo</label>
                                    <Input value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} placeholder="Ej: Harina 1Kg" autoFocus />
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Costo Unitario (Opcional)</label>
                                    <Input type="number" value={newItem.cost} onChange={e => setNewItem({ ...newItem, cost: e.target.value })} placeholder="0.00" />
                                </div>
                            </div>

                            <div className="flex gap-2 mt-4">
                                <Button variant="ghost" onClick={() => setIsCreating(false)}>Cancelar</Button>
                                <Button className="flex-1" onClick={confirmCreateInv}>Confirmar Creación</Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex bg-gray-100 p-1 rounded-xl">
                            <button onClick={() => setTab('inventory')} className={cn("flex-1 py-2 rounded-lg text-sm font-medium", tab === 'inventory' && "bg-white shadow-sm")}>Inventario</button>
                            <button onClick={() => setTab('asset')} className={cn("flex-1 py-2 rounded-lg text-sm font-medium", tab === 'asset' && "bg-white shadow-sm")}>Activo Fijo</button>
                        </div>

                        {tab === 'inventory' ? (
                            <>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium ml-1">Buscar Artículo</label>
                                    <Combobox
                                        items={inventory}
                                        placeholder="Buscar o crear artículo..."
                                        onSelect={(i: any) => setForm({ ...form, itemId: i.id, itemName: i.name })}
                                        onInputChange={(val) => setForm({ ...form, itemName: val, itemId: '' })}
                                        onCreate={handleCreateInv}
                                    />
                                </div>
                            </>
                        ) : (
                            <Input placeholder="Descripción del Activo" value={form.itemName} onChange={e => setForm({ ...form, itemName: e.target.value })} />
                        )}

                        <div className="space-y-1">
                            <label className="text-xs font-medium ml-1">Proveedor (Opcional)</label>
                            <Combobox
                                items={providers}
                                placeholder="Buscar Proveedor..."
                                onSelect={(i: any) => { setForm({ ...form, provId: i.id }); setTempProvName(i.name); }}
                                onInputChange={(val) => { setTempProvName(val); if (!val) setForm({ ...form, provId: '' }); }}
                                onCreate={handleCreateProv}
                                value={tempProvName} // Control the input value
                            />
                        </div>

                        <div className="flex gap-3">
                            <div className="w-24 shrink-0">
                                <label className="text-xs font-medium ml-1">Cantidad</label>
                                <Input type="number" placeholder="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs font-medium ml-1">Precio Unitario</label>
                                <Input type="number" placeholder="0" value={form.unitPrice} onChange={e => setForm({ ...form, unitPrice: e.target.value })} />
                            </div>
                        </div>
                        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Precio Total</span>
                            <span className="text-lg font-black text-jardin-primary">
                                ₡{formatMoney(Math.round(parseFloat(form.quantity || '1') * parseFloat(form.unitPrice || '0')))}
                            </span>
                        </div>

                        <PaymentMethod value={form.method} onChange={(m: any) => setForm({ ...form, method: m })} />

                        {(parseFloat(form.quantity || '1') * parseFloat(form.unitPrice || '0')) === 0 && tab === 'asset' && (
                            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-800 text-xs flex gap-2 items-center">
                                <span>⚠️</span>
                                <p><strong>Advertencia:</strong> Estás registrando un activo con valor ₡0. Esto sumará cantidad pero no afectará contablemente tu Activo Fijo.</p>
                            </div>
                        )}
                        <Button className="w-full" onClick={handleSubmit}>Registrar {tab === 'asset' ? 'Activo' : 'Salida de Dinero'}</Button>
                    </div>
                )}
            </Modal>

            <ConfirmDialog
                isOpen={isConfirming}
                onClose={() => setIsConfirming(false)}
                onConfirm={executeSubmit}
                title="Confirmar Compra"
                data={[
                    { label: "Artículo", value: form.itemName },
                    { label: "Cantidad", value: form.quantity },
                    { label: "Precio Unitario", value: `₡${formatMoney(Math.round(parseFloat(form.unitPrice || '0')))}` },
                    { label: "Precio Total", value: `₡${formatMoney(Math.round(parseFloat(form.quantity || '1') * parseFloat(form.unitPrice || '0')))}`, highlight: true },
                    { label: "Método", value: form.method === 'caja_chica' ? 'Caja Chica' : 'Banco' },
                    { label: "Proveedor", value: providers.find(p => p.id === form.provId)?.name || tempProvName || 'No especificado' }
                ]}
            />

            {feedback.isOpen && (
                <AccountingFeedback
                    isOpen={feedback.isOpen}
                    onClose={closeAll}
                    prev={feedback.prev}
                    curr={feedback.curr}
                    title="Compra Registrada"
                    description={feedback.description}
                />
            )}

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

// 2. Sale
// 2. Sale (Venta con Carrito)
export const SaleModal = ({ isOpen, onClose }: any) => {
    const {
        accounts, updateAccounts, addTransaction,
        products, addProduct, getLedgerAccounts
    } = useStore();

    // Cart State: price is string to allow editing "500" -> "" -> "450"
    const [cart, setCart] = useState<{ id: string; name: string; price: string; qty: number }[]>([]);
    const [typedProductName, setTypedProductName] = useState('');
    const [isConfirming, setIsConfirming] = useState(false);
    const [method, setMethod] = useState('caja_chica');
    const [feedback, setFeedback] = useState<{ isOpen: boolean, prev: any, curr: any, description?: string }>({ isOpen: false, prev: null, curr: null });

    const handleCreateProd = (name: string) => {
        const id = crypto.randomUUID();
        const newProd = { id, name, price: 0 };
        addProduct(newProd);
        addToCart(newProd); // Add immediately
        setTypedProductName(''); // Prevent duplicate on next "Cobrar" click
    };

    const addToCart = (product: any) => {
        setCart([...cart, { id: product.id, name: product.name, price: product.price.toString(), qty: 1 }]);
    };

    const removeFromCart = (index: number) => {
        setCart(cart.filter((_, i) => i !== index));
    };

    const updateItem = (index: number, field: 'price' | 'qty', value: string) => {
        const newCart = [...cart];
        if (field === 'price') {
            newCart[index].price = value;
        } else {
            // Qty must be number
            const qty = parseInt(value) || 0;
            newCart[index].qty = qty;
        }
        setCart(newCart);
    };

    const totalAmount = cart.reduce((sum, item) => sum + ((parseFloat(item.price) || 0) * item.qty), 0);

    const handleSubmit = () => {
        // If user typed something but didn't click add/create, do it now
        if (typedProductName.trim()) {
            handleCreateProd(typedProductName);
            setTypedProductName('');
            return; // Stop here so user can see it added and set price
        }

        if (cart.length === 0 || totalAmount < 0) return;

        setIsConfirming(true);
    };

    const executeSubmit = () => {
        setIsConfirming(false);
        const prevLedger = { ...accounts, ...getLedgerAccounts() };

        // In the Periodic Inventory Model, sales do not track COGS immediately.
        // Cost of Goods Sold is realized via physical "Inventory Adjustments" later.
        let totalCOGS = 0;
        let isInventoriable = false;

        const newAccounts = AccountingActions.registerSale(accounts, totalAmount, totalCOGS, isInventoriable, method as any);
        updateAccounts(() => newAccounts);

        const desc = cart.map(i => `${i.name} (x${formatQty(i.qty)})`).join(', ');

        addTransaction({
            id: crypto.randomUUID(),
            type: 'SALE',
            date: new Date().toISOString(),
            amount: totalAmount,
            description: `Venta: ${desc}`,
            cogs: totalCOGS,
            details: { cart, method }
        });

        // We must fetch from fresh state because updateAccounts and addTransaction run synchronously but getLedgerAccounts relies on the new Tx
        const freshState = useStore.getState();
        const currLedger = { ...freshState.accounts, ...freshState.getLedgerAccounts() };

        setFeedback({ isOpen: true, prev: prevLedger as any, curr: currLedger as any, description: `Venta Total: ₡${formatMoney(totalAmount)} (${cart.length} items)` });
        setCart([]);
        setMethod('caja_chica');
    };

    const closeAll = () => {
        setFeedback({ isOpen: false, prev: null, curr: null });
        setIsConfirming(false);
        onClose();
    };

    return (
        <>
            <Modal isOpen={isOpen && !feedback.isOpen && !isConfirming} onClose={onClose} title="Registrar Venta">
                <div className="space-y-4">
                    {/* Product Search / Add */}
                    <div className="space-y-1">
                        <label className="text-xs font-medium ml-1">Agregar Producto</label>
                        <Combobox
                            items={products}
                            placeholder="Buscar o crear producto..."
                            onSelect={(p: any) => { addToCart(p); setTypedProductName(''); }}
                            onCreate={handleCreateProd}
                            onInputChange={(val) => setTypedProductName(val)}
                            value="" // Always clear after selection
                        />
                    </div>

                    {/* Cart List */}
                    <div className="min-h-[150px] max-h-[40vh] overflow-y-auto border rounded-xl bg-gray-50 p-2 space-y-2">
                        {cart.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-gray-400 text-sm italic py-8">
                                Carrito vacío. Agrega productos arriba.
                            </div>
                        ) : (
                            cart.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded shadow-sm">
                                    <div className="flex-1">
                                        <div className="font-medium text-sm text-gray-800">{item.name}</div>
                                        <div className="text-[10px] text-gray-400">Precio Sugerido</div>
                                    </div>

                                    {/* Qty Input */}
                                    <Input
                                        type="number"
                                        className="w-14 h-8 text-center text-sm p-1"
                                        value={item.qty}
                                        onChange={e => updateItem(idx, 'qty', e.target.value)}
                                        placeholder="Can"
                                    />

                                    {/* Price Input */}
                                    <Input
                                        type="number"
                                        className="w-20 h-8 text-right text-sm font-bold p-1"
                                        value={item.price}
                                        onChange={e => updateItem(idx, 'price', e.target.value)}
                                        placeholder="0"
                                    />

                                    <button onClick={() => removeFromCart(idx)} className="text-gray-400 hover:text-red-500 p-1">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="flex justify-between items-center bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <span className="font-bold text-blue-900">Total a Cobrar</span>
                        <span className="font-black text-2xl text-blue-700">₡{formatMoney(totalAmount)}</span>
                    </div>

                    <PaymentMethod value={method} onChange={setMethod} />

                    {totalAmount === 0 && cart.length > 0 && (
                        <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-800 text-xs flex gap-2 items-center">
                            <span>⚠️</span>
                            <p><strong>Advertencia:</strong> Estás registrando una venta por ₡0 (Cortesía o regalía). Esto restará inventario al cerrar el mes pero no sumará ingresos.</p>
                        </div>
                    )}

                    <Button
                        className="w-full"
                        onClick={handleSubmit}
                        disabled={(cart.length === 0 && !typedProductName.trim()) || (cart.length > 0 && totalAmount < 0)}
                    >
                        Cobrar ₡{formatMoney(totalAmount)}
                    </Button>
                </div>
            </Modal>

            <ConfirmDialog
                isOpen={isConfirming}
                onClose={() => setIsConfirming(false)}
                onConfirm={executeSubmit}
                title="Confirmar Venta"
                data={[
                    { label: "Items", value: cart.map(i => `${i.name} (x${formatQty(i.qty)})`).join(', ') },
                    { label: "Monto Total", value: `₡${formatMoney(totalAmount)}`, highlight: true },
                    { label: "Método de Pago", value: method === 'caja_chica' ? 'Caja Chica' : 'Banco' }
                ]}
            />

            {feedback.isOpen && (
                <AccountingFeedback
                    isOpen={feedback.isOpen}
                    onClose={closeAll}
                    prev={feedback.prev}
                    curr={feedback.curr}
                    title="Venta Registrada"
                    description={feedback.description}
                />
            )}
        </>
    );
};

// 3. Expense
export const ExpenseModal = ({ isOpen, onClose }: any) => {
    const {
        accounts, updateAccounts, addTransaction,
        expenseTypes, addExpenseType,
        providers, addProvider, getLedgerAccounts
    } = useStore();
    const [form, setForm] = useState({ typeId: '', typeName: '', amount: '', method: 'caja_chica', provId: '', detail: '' });
    const [tempProvName, setTempProvName] = useState('');
    const [isConfirming, setIsConfirming] = useState(false);
    const [feedback, setFeedback] = useState<{ isOpen: boolean, prev: any, curr: any, description?: string }>({ isOpen: false, prev: null, curr: null });

    const handleCreateExpType = (name: string) => {
        const id = crypto.randomUUID();
        addExpenseType({ id, name });
        setForm(prev => ({ ...prev, typeId: id, typeName: name }));
    };

    const handleCreateProv = (name: string) => {
        const id = crypto.randomUUID();
        addProvider({ id, name });
        setForm(prev => ({ ...prev, provId: id }));
    };

    const handleSubmit = () => {
        const amount = parseFloat(form.amount || '0');
        if (amount <= 0 || !form.typeName) return;
        setIsConfirming(true);
    };

    const executeSubmit = () => {
        setIsConfirming(false);
        // NEW: Auto-create provider if typed but not selected
        let finalProvId = form.provId;
        if (!finalProvId && tempProvName.trim()) {
            const existing = providers.find(p => normalizeName(p.name) === normalizeName(tempProvName));
            if (existing) {
                finalProvId = existing.id;
            } else {
                finalProvId = crypto.randomUUID();
                addProvider({ id: finalProvId, name: tempProvName });
            }
        }

        const amount = parseFloat(form.amount || '0');
        if (amount <= 0) return;

        const prevLedger = { ...accounts, ...getLedgerAccounts() };
        const newAccounts = AccountingActions.payExpense(accounts, amount, form.method as any);
        updateAccounts(() => newAccounts);
        addTransaction({
            id: crypto.randomUUID(),
            type: 'EXPENSE',
            date: new Date().toISOString(),
            amount,
            description: `Gasto (${form.typeName})`,
            details: { typeName: form.typeName, method: form.method, detail: form.detail.trim(), provName: finalProvId ? providers.find(p => p.id === finalProvId)?.name || tempProvName : 'N/A' }
        });

        const freshState = useStore.getState();
        const currLedger = { ...freshState.accounts, ...freshState.getLedgerAccounts() };

        setFeedback({ isOpen: true, prev: prevLedger as any, curr: currLedger as any, description: `Pago de: ${form.typeName}` });
        setForm({ typeId: '', typeName: '', amount: '', method: 'caja_chica', provId: '', detail: '' });
        setTempProvName('');
    };

    const closeAll = () => {
        setFeedback({ isOpen: false, prev: null, curr: null });
        setIsConfirming(false);
        onClose();
    };

    return (
        <>
            <Modal isOpen={isOpen && !feedback.isOpen && !isConfirming} onClose={onClose} title="Registrar Gasto">
                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-medium ml-1">Tipo de Gasto</label>
                        <Combobox
                            items={expenseTypes}
                            placeholder="Buscar o crear tipo de gasto..."
                            value={form.typeName}
                            onSelect={(t: any) => setForm({ ...form, typeId: t.id, typeName: t.name })}
                            onInputChange={(val) => { setForm({ ...form, typeId: '', typeName: val }); }}
                            onCreate={handleCreateExpType}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-medium ml-1">Proveedor/Beneficiario (Opcional)</label>
                        <Combobox
                            items={providers}
                            placeholder="Buscar..."
                            onSelect={(i: any) => { setForm({ ...form, provId: i.id }); setTempProvName(i.name); }}
                            onInputChange={(val) => { setTempProvName(val); if (!val) setForm({ ...form, provId: '' }); }}
                            onCreate={handleCreateProv}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-medium ml-1">Detalle (Opcional)</label>
                        <Input placeholder="Ej: Factura #1234, Limpieza general..." value={form.detail} onChange={e => setForm({ ...form, detail: e.target.value })} />
                    </div>

                    <Input type="number" placeholder="Monto" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                    <PaymentMethod value={form.method} onChange={(m: any) => setForm({ ...form, method: m })} />
                    <Button className="w-full" onClick={handleSubmit}>Gastar</Button>
                </div>
            </Modal>

            <ConfirmDialog
                isOpen={isConfirming}
                onClose={() => setIsConfirming(false)}
                onConfirm={executeSubmit}
                title="Confirmar Gasto"
                data={[
                    { label: "Tipo de Gasto", value: form.typeName },
                    { label: "Monto", value: `₡${formatMoney(parseFloat(form.amount))}`, highlight: true },
                    { label: "Método", value: form.method === 'caja_chica' ? 'Caja Chica' : 'Banco' },
                    { label: "Proveedor", value: providers.find(p => p.id === form.provId)?.name || tempProvName || 'N/A' },
                    { label: "Detalle", value: form.detail || 'Sin detalle' }
                ]}
            />

            {feedback.isOpen && (
                <AccountingFeedback
                    isOpen={feedback.isOpen}
                    onClose={closeAll}
                    prev={feedback.prev}
                    curr={feedback.curr}
                    title="Gasto Registrado"
                    description={feedback.description}
                />
            )}


        </>
    );
};

// 4. Production (Cooking)
export const ProductionModal = ({ isOpen, onClose }: any) => {
    const {
        inventory, updateInventoryItem,
        addInventoryItem, accounts, addTransaction,
        consumeInventoryFIFO, getLedgerAccounts
    } = useStore();

    // State
    const [ingredients, setIngredients] = useState<{ item: any, qty: string }[]>([]);
    const [output, setOutput] = useState<{ name: string, qty: string, id?: string }>({ name: '', qty: '1' });
    const [isConfirming, setIsConfirming] = useState(false);
    const [duplicateError, setDuplicateError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ isOpen: boolean, prev: any, curr: any, description?: string }>({ isOpen: false, prev: null, curr: null });

    // Add Ingredient
    const handleAddIngredient = (item: any) => {
        if (ingredients.find(i => i.item.id === item.id)) return;
        setIngredients([...ingredients, { item, qty: '' }]);
    };

    const handleRemoveIngredient = (id: string) => {
        setIngredients(ingredients.filter(i => i.item.id !== id));
    };

    const handleIngredientQtyChange = (id: string, qty: string) => {
        setIngredients(ingredients.map(i => i.item.id === id ? { ...i, qty } : i));
    };

    // Create new Ingredient on the fly
    const handleCreateIngredient = (name: string) => {
        const trimmedName = name.trim();
        if (inventory.some(i => normalizeName(i.name) === normalizeName(trimmedName))) {
            setDuplicateError('Ese ingrediente ya existe en el catálogo.');
            return;
        }
        const newId = crypto.randomUUID();
        const newItem = { id: newId, name: trimmedName, stock: 0, cost: 0 };
        addInventoryItem(newItem);
        handleAddIngredient(newItem);
    };

    // Create Output Product Immediately
    const handleCreateOutput = (name: string) => {
        const trimmedName = name.trim();
        if (inventory.some(i => normalizeName(i.name) === normalizeName(trimmedName))) {
            setDuplicateError('Ese producto final ya existe en el catálogo.');
            return;
        }
        const newId = crypto.randomUUID();
        // Create in inventory with 0 stock/cost to establish existence
        // The production submission will handle updating its average cost later.
        addInventoryItem({ id: newId, name, stock: 0, cost: 0 });
        setOutput({ ...output, name, id: newId });
    };

    const outputQty = parseFloat(output.qty || '0');
    const totalIngCost = ingredients.reduce((sum: number, i: any) => sum + (i.item.cost * (parseFloat(i.qty) || 0)), 0);
    const unitCost = outputQty > 0 ? totalIngCost / outputQty : 0;

    const handleSubmit = () => {
        if (ingredients.length === 0 || !output.name || outputQty <= 0) return;
        setIsConfirming(true);
    };

    const executeSubmit = () => {
        setIsConfirming(false);
        const exactTotalCost = ingredients.reduce((acc, ing) => acc + consumeInventoryFIFO(ing.item.id, parseFloat(ing.qty || '0')), 0);

        const prevLedger = { ...accounts, ...getLedgerAccounts() };

        // 2. Update Output Product
        const newBatch = {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            stock: outputQty,
            cost: exactTotalCost / outputQty
        };

        const existing = inventory.find(i => normalizeName(i.name) === normalizeName(output.name));

        if (existing) {
            const existingBatches = existing.batches && existing.batches.length > 0 ? [...existing.batches] : [{
                id: 'legacy-' + crypto.randomUUID(),
                date: new Date(0).toISOString(),
                cost: existing.cost,
                stock: existing.stock
            }];

            const newStock = existing.stock + outputQty;
            const newTotalVal = (existing.cost * existing.stock) + exactTotalCost;
            const newAvgCost = newStock > 0 ? newTotalVal / newStock : 0;

            updateInventoryItem(existing.id, {
                stock: newStock,
                cost: newAvgCost,
                batches: [...existingBatches, newBatch]
            });
        } else {
            addInventoryItem({
                id: crypto.randomUUID(),
                name: output.name,
                stock: outputQty,
                cost: newBatch.cost, // Use explicit exact batch cost
                batches: [newBatch]
            });
        }

        // 3. Accounting
        const ingText = ingredients.map(i => `${formatQty(parseFloat(i.qty))}x ${i.item.name}`).join(', ');
        addTransaction({
            id: crypto.randomUUID(),
            type: 'PRODUCTION',
            date: new Date().toISOString(),
            amount: exactTotalCost,
            description: `Cocina: ${outputQty}x ${output.name} (usando ${ingText})`,
            cogs: exactTotalCost,
            details: { outputName: output.name, outputQty, ingredients }
        });

        const freshState = useStore.getState();
        const currLedger = { ...freshState.accounts, ...freshState.getLedgerAccounts() };

        setFeedback({
            isOpen: true,
            prev: prevLedger as any,
            curr: currLedger as any,
            description: `Produjiste: ${output.name} (${outputQty} unidades)`
        });

        setIngredients([]);
        setOutput({ name: '', qty: '1' });
    };

    const closeAll = () => {
        setFeedback({ isOpen: false, prev: null, curr: null });
        setIsConfirming(false);
        onClose();
    };

    return (
        <>
            <Modal isOpen={isOpen && !feedback.isOpen && !isConfirming} onClose={onClose} title="Producción (Cocina)" className="max-w-4xl">
                <div className="grid md:grid-cols-2 gap-6">
                    {/* Ingredients Column */}
                    <div className="space-y-4 border-r pr-4">
                        <h4 className="font-bold text-sm text-gray-500 uppercase">1. Inventario (Receta)</h4>
                        <Combobox
                            items={inventory}
                            placeholder="Agregar artículo..."
                            onSelect={handleAddIngredient}
                            onCreate={handleCreateIngredient}
                            value=""
                        />
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {ingredients.length === 0 && (
                                <div className="text-gray-400 text-sm text-center italic py-4">
                                    No hay ingredientes agregados
                                </div>
                            )}
                            {ingredients.map((ing) => (
                                <div key={ing.item.id} className="flex justify-between items-center bg-gray-50 p-2 rounded text-sm">
                                    <div>
                                        <div className="font-bold text-gray-700">{ing.item.name}</div>
                                        <div className="text-xs text-gray-400">Stock: {formatQty(ing.item.stock)} | Costo: ₡{formatMoney(ing.item.cost)}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            className="w-20 text-right h-8"
                                            placeholder="Cant"
                                            value={ing.qty}
                                            onChange={(e) => handleIngredientQtyChange(ing.item.id, e.target.value)}
                                        />
                                        <button onClick={() => handleRemoveIngredient(ing.item.id)} className="text-gray-300 hover:text-red-500">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="bg-gray-100 p-2 rounded flex justify-between font-bold text-sm">
                            <span>Costo Total Inventario:</span>
                            <span>₡{formatMoney(totalIngCost)}</span>
                        </div>
                    </div>

                    {/* Output Column */}
                    <div className="space-y-4">
                        <h4 className="font-bold text-sm text-gray-500 uppercase">2. Producto Final</h4>

                        <div className="space-y-1">
                            <label className="text-xs font-medium ml-1">Nombre del Producto</label>
                            <Combobox
                                items={inventory} // Can select existing to replenish stock
                                placeholder="Ej: Picadillo por kg"
                                onSelect={(i: any) => setOutput({ ...output, name: i.name, id: i.id })}
                                onInputChange={(val) => setOutput({ ...output, name: val, id: '' })}
                                onCreate={handleCreateOutput}
                                value={output.name}
                            />
                        </div>

                        <div className="flex gap-4">
                            <div className="w-1/2">
                                <label className="text-xs font-medium ml-1">Cantidad Resultante</label>
                                <Input
                                    type="number"
                                    placeholder="Ej: 3"
                                    value={output.qty}
                                    onChange={e => setOutput({ ...output, qty: e.target.value })}
                                />
                            </div>
                            <div className="w-1/2">
                                <label className="text-xs font-medium ml-1">Costo Unitario (Calc)</label>
                                <div className="p-2 bg-gray-100 rounded border border-gray-200 text-right font-mono font-bold text-gray-600">
                                    ₡{formatMoney(unitCost)}
                                </div>
                            </div>
                        </div>

                        <div className="pt-8">
                            <Button
                                className="w-full h-12 text-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:bg-gray-400"
                                onClick={handleSubmit}
                                disabled={ingredients.length === 0 || !output.name}
                            >
                                <div className="flex flex-col items-center leading-tight">
                                    <span>
                                        {!output.name ? 'Falta Nombre Producto' :
                                            ingredients.length === 0 ? 'Falta Agregar Artículos' :
                                                'Confirmar Producción'}
                                    </span>
                                    <span className="text-[10px] opacity-80 font-normal">
                                        {!output.name ? 'Selecciona o crea el producto final' :
                                            ingredients.length === 0 ? 'Agrega al menos un ingrediente' :
                                                'Transformar Inventario en Producto'}
                                    </span>
                                </div>
                            </Button>
                        </div>
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                isOpen={isConfirming}
                onClose={() => setIsConfirming(false)}
                onConfirm={executeSubmit}
                title="Confirmar Producción"
                data={[
                    { label: "Producto Resultante", value: `${output.name} (x${formatQty(parseFloat(output.qty))})` },
                    { label: "Costo Total Estimado", value: `₡${formatMoney(totalIngCost)}`, highlight: true },
                    { label: "Ingredientes", value: ingredients.map(i => `${formatQty(parseFloat(i.qty))}x ${i.item.name}`).join(', ') }
                ]}
            />

            {feedback.isOpen && (
                <AccountingFeedback
                    isOpen={feedback.isOpen}
                    onClose={closeAll}
                    prev={feedback.prev}
                    curr={feedback.curr}
                    title="Producción Exitosa"
                    description={feedback.description}
                />
            )}

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

// 5. Inventory Count
export const InventoryCountModal = ({ isOpen, onClose }: any) => {
    const { inventory, locations, updateInventoryItem, accounts, updateAccounts, addTransaction, consumeInventoryFIFO } = useStore();

    // State: map of itemId -> newStock (string to allow typing)
    const [counts, setCounts] = useState<Record<string, string>>({});
    const [search, setSearch] = useState('');
    const [filterLocation, setFilterLocation] = useState('');

    const filtered = inventory.filter(i => {
        const matchSearch = normalizeName(i.name).includes(normalizeName(search)) && !i.hidden;
        if (!matchSearch) return false;
        if (filterLocation) {
            if (filterLocation === 'none') return !i.locationId;
            return i.locationId === filterLocation;
        }
        return true;
    });

    // Init counts with system values only once on open
    // Ideally use useEffect, but for simplicity we rely on manual entry or placeholder.
    // Let's just track CHANGED values.

    const getDiffValue = () => {
        let totalSystemValue = 0;
        let totalRealValue = 0;
        let diff = 0;

        Object.entries(counts).forEach(([id, valStr]) => {
            const item = inventory.find(i => i.id === id);
            if (item) {
                const realStock = parseFloat(valStr || '0');
                const sysVal = item.cost * item.stock;
                const realVal = item.cost * realStock;

                totalSystemValue += sysVal;
                totalRealValue += realVal;
                diff += (sysVal - realVal); // Positive = Loss (Missing)
            }
        });
        return diff;
    };

    const diff = getDiffValue();

    const handleSubmit = () => {
        let exactTotalDiff = 0;
        let itemsAdjusted = 0;
        const itemDetails: any[] = [];

        // Process updates
        Object.entries(counts).forEach(([id, valStr]) => {
            const item = inventory.find(i => i.id === id);
            if (!item) return;

            const realStock = parseFloat(valStr || '0');
            const difference = item.stock - realStock; // Positive if stock was lost
            let financialDiff = 0;

            if (difference > 0) {
                // Lost stock -> FIFO deduction
                const lostCost = consumeInventoryFIFO(id, difference);
                financialDiff = lostCost;
                exactTotalDiff += lostCost;
                itemsAdjusted++;
            } else if (difference < 0) {
                // Found stock -> Add new batch at current average cost
                const extraQty = Math.abs(difference);
                const avgCost = item.cost;
                const newBatch = {
                    id: crypto.randomUUID(),
                    date: new Date().toISOString(),
                    stock: extraQty,
                    cost: avgCost
                };

                const existingBatches = item.batches && item.batches.length > 0 ? [...item.batches] : [{
                    id: 'legacy-' + crypto.randomUUID(),
                    date: new Date(0).toISOString(),
                    cost: item.cost,
                    stock: item.stock
                }];

                const newStock = item.stock + extraQty;
                const newTotalVal = (item.cost * item.stock) + (extraQty * avgCost);
                const newAvgCost = newStock > 0 ? newTotalVal / newStock : 0;

                updateInventoryItem(id, {
                    stock: newStock,
                    cost: newAvgCost,
                    batches: [...existingBatches, newBatch]
                });

                financialDiff = -(extraQty * avgCost);
                exactTotalDiff += financialDiff; // Negative difference = gained value
                itemsAdjusted++;
            }

            if (difference !== 0) {
                itemDetails.push({ id, name: item.name, sys: item.stock, real: realStock, financialDiff });
            }
        });

        if (itemsAdjusted === 0) {
            onClose(); return;
        }

        // 2. Accounting Adjustment
        const newAccounts = AccountingActions.adjustInventoryValues(accounts, exactTotalDiff);
        updateAccounts(() => newAccounts);

        // 3. Log
        addTransaction({
            id: crypto.randomUUID(),
            type: 'ADJUSTMENT',
            date: new Date().toISOString(),
            amount: Math.abs(exactTotalDiff),
            description: `Toma Físico (${itemsAdjusted} items, Val: ₡${formatMoney(exactTotalDiff)})`,
            cogs: exactTotalDiff,
            details: { itemsAdjusted, exactTotalDiff, counts, itemDetails }
        });

        onClose();
        setCounts({});
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Toma de Inventario Físico">
            <div className="flex flex-col h-[60vh]">
                <div className="mb-4 flex flex-col sm:flex-row gap-2">
                    <Input
                        placeholder="Buscar artículo..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        autoFocus
                        className="flex-1"
                    />
                    <select
                        className="px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-jardin-primary/20 focus:border-jardin-primary bg-white text-sm"
                        value={filterLocation}
                        onChange={e => setFilterLocation(e.target.value)}
                    >
                        <option value="">Todas las Ubicaciones</option>
                        <option value="none">Bodega Central (Sin asignación)</option>
                        {locations.filter(l => !l.hidden).map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-1 overflow-y-auto mb-4 border rounded-xl">
                    <table className="w-full text-sm text-left relative">
                        <thead className="text-gray-500 bg-gray-50 sticky top-0 z-10 text-xs uppercase">
                            <tr>
                                <th className="p-3">Artículo</th>
                                <th className="p-3 text-center">Sistema</th>
                                <th className="p-3 w-24">Físico</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="p-4 text-center text-gray-400 text-sm">
                                        No se encontraron artículos.
                                    </td>
                                </tr>
                            )}
                            {filtered.map(item => (
                                <tr key={item.id}>
                                    <td className="p-3 font-medium">
                                        {item.name}
                                        <div className="text-[10px] text-gray-400 font-normal">Promedio: ₡{formatMoney(item.cost)}</div>
                                    </td>
                                    <td className="p-3 text-center text-gray-500">{formatQty(item.stock)}</td>
                                    <td className="p-3">
                                        <input
                                            type="number"
                                            min="0"
                                            className={cn("w-20 p-1 border rounded text-center focus:outline-none focus:ring-2",
                                                counts[item.id] && parseFloat(counts[item.id]) !== item.stock ? "border-amber-400 bg-amber-50" : "border-gray-200"
                                            )}
                                            placeholder={Number(item.stock.toFixed(2)).toString()}
                                            value={counts[item.id] !== undefined ? counts[item.id] : ''}
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (val.includes('-')) return;
                                                if (val === '') {
                                                    const newCounts = { ...counts };
                                                    delete newCounts[item.id];
                                                    setCounts(newCounts);
                                                } else {
                                                    setCounts({ ...counts, [item.id]: val });
                                                }
                                            }}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="bg-gray-50 p-4 rounded-xl flex justify-between items-center">
                    <div>
                        <div className="text-xs font-bold text-gray-500 uppercase">Ajuste Valor (Diferencia)</div>
                        <div className={cn("text-xl font-black", diff > 0 ? "text-red-600" : "text-green-600")}>
                            {diff > 0 ? '-' : '+'}₡{formatMoney(Math.abs(diff))}
                        </div>
                    </div>
                    <Button onClick={handleSubmit}>Confirmar Ajuste</Button>
                </div>
            </div>
        </Modal>
    );
};

// 6. Asset Count (Toma de Activos)


// 6. Asset Count (Toma de Activos)
export const AssetCountModal = ({ isOpen, onClose }: any) => {
    const { assets, batchUpdateAssets, accounts, updateAccounts, addTransaction } = useStore();

    // State
    const [counts, setCounts] = useState<Record<string, string>>({});
    const [qCounts, setQCounts] = useState<Record<string, string>>({});
    const [search, setSearch] = useState('');

    // Safety check matching Inventory, but treating undefined as empty
    const safeAssets = Array.isArray(assets) ? assets : [];
    const filtered = safeAssets.filter(i => i && i.name && normalizeName(i.name).includes(normalizeName(search)));

    const getDiffValue = () => {
        let diff = 0;
        Object.entries(counts).forEach(([id, valStr]) => {
            const item = safeAssets.find(i => i && i.id === id);
            if (item) {
                const sysVal = item.value || 0;
                const realVal = parseFloat(valStr || '0');
                diff += (sysVal - realVal);
            }
        });
        return diff;
    };

    const diff = getDiffValue();

    const handleSubmit = () => {
        const itemUpdates: any[] = [];
        const itemDetails: any[] = [];

        Object.entries(counts).forEach(([id, valStr]) => {
            const item = safeAssets.find(i => i && i.id === id);
            if (item) {
                const sysVal = item.value || 0;
                const realVal = parseFloat(valStr || '0');
                const sysQty = item.quantity || 1;
                const realQty = parseFloat(qCounts[id] || sysQty.toString());

                if (sysVal !== realVal || sysQty !== realQty) {
                    itemUpdates.push({ ...item, value: realVal, quantity: realQty });
                    itemDetails.push({ id, name: item.name, sysVal, realVal, financialDiff: sysVal - realVal });
                }
            }
        });

        if (itemUpdates.length === 0) {
            onClose(); return;
        }

        batchUpdateAssets(itemUpdates);

        // Accounting Adjustment
        const newAccounts = { ...accounts };
        newAccounts.activo_fijo = (newAccounts.activo_fijo || 0) - diff;
        newAccounts.gastos = (newAccounts.gastos || 0) + diff;

        updateAccounts(() => newAccounts);

        addTransaction({
            id: crypto.randomUUID(),
            type: 'ADJUSTMENT',
            date: new Date().toISOString(),
            amount: Math.abs(diff),
            description: `Ajuste de Activos (Dif: ${diff > 0 ? '-' : '+'}₡${formatMoney(Math.abs(diff))})`,
            cogs: diff,
            details: { counts, diff, itemDetails }
        });

        onClose();
        setCounts({});
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Toma de Activos Físicos">
            <div className="flex flex-col h-[60vh]">
                <div className="mb-4">
                    <Input
                        placeholder="Buscar activo..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        autoFocus
                    />
                </div>
                <div className="flex-1 overflow-y-auto mb-4 border rounded-xl">
                    <table className="w-full text-sm text-left relative">
                        <thead className="text-gray-500 bg-gray-50 sticky top-0 z-10 text-xs uppercase">
                            <tr>
                                <th className="p-3">Activo</th>
                                <th className="p-3 text-center">Cant. Sistema</th>
                                <th className="p-3 text-center">Cant. Real</th>
                                <th className="p-3 text-center">Valor Total Real</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="p-4 text-center text-gray-400 text-sm">
                                        No se encontraron activos.
                                    </td>
                                </tr>
                            )}
                            {filtered.map(item => (
                                <tr key={item.id}>
                                    <td className="p-3 font-medium">
                                        {item.name}
                                        <div className="text-[10px] text-gray-400">Sis: ₡{formatMoney(item.value || 0)} (x{formatQty(item.quantity || 1)})</div>
                                    </td>
                                    <td className="p-3 text-center text-gray-400">{item.quantity || 1}</td>
                                    <td className="p-3">
                                        <input
                                            type="number"
                                            className={cn("w-20 p-1 border rounded text-center focus:outline-none focus:ring-2",
                                                qCounts[item.id] && parseFloat(qCounts[item.id]) !== (item.quantity || 1) ? "border-amber-400 bg-amber-50" : "border-gray-200"
                                            )}
                                            placeholder={Number((item.quantity || 1).toFixed(2)).toString()}
                                            value={qCounts[item.id] !== undefined ? qCounts[item.id] : ''}
                                            onChange={e => {
                                                const newQty = e.target.value;
                                                if (newQty.includes('-')) return;
                                                const updates: any = { ...qCounts, [item.id]: newQty };
                                                setQCounts(updates);

                                                // Proportional value adjustment suggestion if value not yet touched
                                                if (counts[item.id] === undefined && newQty) {
                                                    const q = parseFloat(newQty);
                                                    if (q >= 0 && (item.quantity || 1) > 0) {
                                                        const newVal = (item.value / (item.quantity || 1)) * q;
                                                        setCounts(prev => ({ ...prev, [item.id]: newVal.toString() }));
                                                    }
                                                }
                                            }}
                                        />
                                    </td>
                                    <td className="p-3">
                                        <input
                                            type="number"
                                            className={cn("w-28 p-1 border rounded text-right focus:outline-none focus:ring-2 ml-auto block",
                                                counts[item.id] && parseFloat(counts[item.id]) !== (item.value || 0) ? "border-amber-400 bg-amber-50" : "border-gray-200"
                                            )}
                                            placeholder={Math.round(item.value || 0).toString()}
                                            value={counts[item.id] !== undefined ? counts[item.id] : ''}
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (val.includes('-')) return;
                                                setCounts({ ...counts, [item.id]: val });
                                            }}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="bg-gray-50 p-4 rounded-xl flex justify-between items-center">
                    <div>
                        <div className="text-xs font-bold text-gray-500 uppercase">Ajuste Valor (Diferencia)</div>
                        <div className={cn("text-xl font-black", diff > 0 ? "text-red-600" : "text-green-600")}>
                            {diff > 0 ? '-' : '+'}₡{formatMoney(Math.abs(diff))}
                        </div>
                    </div>
                    <Button onClick={handleSubmit}>Confirmar Ajuste</Button>
                </div>
            </div>
        </Modal>
    );
};

// 7. Cash & Bank Adjustment (Ajuste de Caja Chica y Bancos)
export const CashAdjustmentModal = ({ isOpen, onClose }: any) => {
    const { accounts, updateAccounts, addTransaction } = useStore();

    // State
    const [counts, setCounts] = useState<Record<string, string>>({
        caja_chica: Math.round(accounts.caja_chica || 0).toString(),
        banco: Math.round(accounts.banco || 0).toString()
    });

    const getDiffValue = (account: 'caja_chica' | 'banco') => {
        const sysVal = accounts[account];
        const realVal = parseFloat(counts[account] || '0');
        // Positive diff means we lost money (System > Real)
        return sysVal - realVal;
    };

    const diffCaja = getDiffValue('caja_chica');
    const diffBanco = getDiffValue('banco');
    const totalDiff = diffCaja + diffBanco;

    const handleSubmit = () => {
        if (totalDiff === 0) {
            onClose(); return;
        }

        let newAccounts = { ...accounts };
        if (diffCaja !== 0) {
            newAccounts = AccountingActions.auditCash(newAccounts, accounts.caja_chica, parseFloat(counts.caja_chica || '0'), 'caja_chica');
            addTransaction({
                id: crypto.randomUUID(),
                type: 'ADJUSTMENT',
                date: new Date().toISOString(),
                amount: Math.abs(diffCaja),
                description: `Ajuste Caja Chica (Dif: ${diffCaja > 0 ? '-' : '+'}₡${formatMoney(Math.abs(diffCaja))})`,
                details: { method: 'caja_chica', diffCaja }
            });
        }
        if (diffBanco !== 0) {
            newAccounts = AccountingActions.auditCash(newAccounts, accounts.banco, parseFloat(counts.banco || '0'), 'banco');
            addTransaction({
                id: crypto.randomUUID(),
                type: 'ADJUSTMENT',
                date: new Date().toISOString(),
                amount: Math.abs(diffBanco),
                description: `Ajuste Bancos (Dif: ${diffBanco > 0 ? '-' : '+'}₡${formatMoney(Math.abs(diffBanco))})`,
                details: { method: 'banco', diffBanco }
            });
        }

        updateAccounts(() => newAccounts);

        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Ajuste de Caja Chica y Bancos">
            <div className="flex flex-col space-y-4">
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex justify-between items-center">
                    <div>
                        <div className="text-emerald-800 font-bold mb-1">Caja Chica</div>
                        <div className="text-xs text-emerald-600">Sistema: ₡{formatMoney(accounts.caja_chica)}</div>
                    </div>
                    <div>
                        <input
                            type="number"
                            className={cn("w-32 p-2 border rounded-lg text-right font-bold focus:outline-none focus:ring-2",
                                diffCaja !== 0 ? "border-amber-400 bg-amber-50" : "border-gray-200"
                            )}
                            value={counts.caja_chica}
                            onChange={e => {
                                const val = e.target.value;
                                if (val.includes('-') || val.includes('.')) return;
                                setCounts({ ...counts, caja_chica: val });
                            }}
                        />
                    </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex justify-between items-center">
                    <div>
                        <div className="text-blue-800 font-bold mb-1">Bancos</div>
                        <div className="text-xs text-blue-600">Sistema: ₡{formatMoney(accounts.banco)}</div>
                    </div>
                    <div>
                        <input
                            type="number"
                            className={cn("w-32 p-2 border rounded-lg text-right font-bold focus:outline-none focus:ring-2",
                                diffBanco !== 0 ? "border-amber-400 bg-amber-50" : "border-gray-200"
                            )}
                            value={counts.banco}
                            onChange={e => {
                                const val = e.target.value;
                                if (val.includes('-') || val.includes('.')) return;
                                setCounts({ ...counts, banco: val });
                            }}
                        />
                    </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-xl flex justify-between items-center mt-4">
                    <div>
                        <div className="text-xs font-bold text-gray-500 uppercase">Ajuste Valor (Diferencia)</div>
                        <div className={cn("text-xl font-black", totalDiff > 0 ? "text-red-600" : totalDiff < 0 ? "text-green-600" : "text-gray-400")}>
                            {totalDiff > 0 ? '-' : totalDiff < 0 ? '+' : ''}₡{formatMoney(Math.abs(totalDiff))}
                        </div>
                    </div>
                    <Button onClick={handleSubmit} disabled={totalDiff === 0}>Confirmar Ajuste</Button>
                </div>
            </div>
        </Modal>
    );
};
