export interface AppState {
    initialized: boolean;
    accounts: Accounts;
    inventory: InventoryItem[];
    products: Product[];
    providers: Provider[];
    expenseTypes: ExpenseType[];
    transactions: Transaction[];
    assets: AssetItem[];
}

export interface Accounts {
    caja_chica: number;
    banco: number;
    inventario: number; // Sum of InventoryItem cost * stock
    activo_fijo: number; // Sum of AssetItem cost
    patrimonio: number; // Capital Social = Initial Assets - Initial Liabilities (0)
    ventas?: number; // Kept as optional for legacy data parsing, but unused in Ledger V2
    costos?: number;
    gastos?: number;
    _isLedger?: boolean; // Marker to know DB has been updated
}

export interface InventoryBatch {
    id: string;
    date: string;
    cost: number;
    stock: number; // Remaining stock in this specific batch
}

export interface InventoryItem {
    id: string;
    name: string; // "Leche 2L"
    cost: number; // Weighted average cost (for UI display purposes)
    stock: number; // Total stock (sum of all batches)
    batches?: InventoryBatch[]; // Legacy items might not have this initially
    hidden?: boolean; // Soft-delete: hidden from operations but kept for accounting integrity
}

export interface AssetItem {
    id: string;
    name: string; // "Crepera"
    value: number;
    quantity: number;
}

export interface Product {
    id: string;
    name: string;
    price: number;
    inventoryItemId?: string; // If linked to an inventory item (e.g. 1 Coca Cola)
    hidden?: boolean;
}

export interface Provider {
    id: string;
    name: string;
    hidden?: boolean;
}

export interface ExpenseType {
    id: string;
    name: string; // "Luz", "Agua"
    hidden?: boolean;
}

export interface Transaction {
    id: string;
    date: string;
    type: 'PURCHASE' | 'SALE' | 'EXPENSE' | 'ADJUSTMENT' | 'PRODUCTION' | 'INITIALIZATION';
    amount: number;
    description: string;
    cogs?: number; // Tracks exact Cost of Goods Sold for reporting correctly by month
    details?: any;
    status?: 'ACTIVE' | 'VOIDED'; // Added for Reversions
    voidingTxId?: string; // Links this transaction to the reversing event
}

export const INITIAL_STATE: AppState = {
    initialized: false,
    accounts: {
        caja_chica: 0,
        banco: 0,
        inventario: 0,
        activo_fijo: 0,
        patrimonio: 0,
    },
    inventory: [],
    products: [],
    providers: [],
    expenseTypes: [],
    transactions: [],
    assets: [],
};
