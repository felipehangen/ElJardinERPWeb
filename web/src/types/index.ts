export interface AppState {
    initialized: boolean;
    accounts: Accounts;
    inventory: InventoryItem[];
    products: Product[];
    providers: Provider[];
    expenseTypes: ExpenseType[];
    transactions: Transaction[];
    assets: AssetItem[];
    locations: Location[];
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
    locationId?: string; // Tying this inventory item to a location
}

export interface AssetItem {
    id: string;
    name: string; // "Crepera"
    value: number;
    quantity: number;
}

export interface Location {
    id: string;
    name: string; // "Bodega, Restaurante"
    hidden?: boolean;
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

// ─── Transaction Detail Shapes ──────────────────────────────────────────────
// One interface per operation type.  These are exported so callers can use
// them explicitly when *creating* transactions (better IDE autocomplete and
// compile-time field-name checking).  The Transaction.details field is still
// typed as the union below so that *reading* code (revertTransaction, etc.)
// doesn't require narrowing casts on every optional-chain access.

export interface PurchaseInventoryDetails {
    type: 'inventory';
    itemId?: string;
    itemName: string;
    batchId?: string;       // FIFO batch ID — stored for exact reversal
    assetId?: undefined;
    quantity: number;
    method: 'caja_chica' | 'banco';
    providerName?: string;
}

export interface PurchaseAssetDetails {
    type: 'asset';
    assetId?: string;       // catalog ID — stored at runtime for reversal
    itemName: string;
    quantity: number;
    method: 'caja_chica' | 'banco';
    providerName?: string;
}

export interface SaleDetails {
    method: 'caja_chica' | 'banco' | 'split';
    splitAmounts?: { caja_chica: number; banco: number };
    cart: Array<{ id?: string; name: string; qty: number; price: string | number }>;
}

export interface ExpenseDetails {
    typeName: string;
    method: 'caja_chica' | 'banco';
}

export interface ProductionDetails {
    outputId?: string;
    outputName: string;
    outputQty: number;
    ingredients: Array<{ item: { id: string; name: string; cost: number }; qty: number | string }>;
}

export interface CashAdjustmentDetails {
    method: 'caja_chica' | 'banco';
    account?: 'caja_chica' | 'banco';   // alias used by some older paths
    diffCaja?: number;   // positive = loss (system > real), negative = gain
    diffBanco?: number;  // positive = loss (system > real), negative = gain
}

export interface InventoryCountDetails {
    itemsAdjusted: number;              // count of items whose physical stock differed
    exactTotalDiff: number;             // total financial change (positive = loss, negative = gain)
    counts: Record<string, string>;     // raw user input: { itemId → typed string count }
    itemDetails: Array<{
        id: string;
        name: string;
        sys: number;                    // system stock before count
        real: number;                   // physical stock entered by user
        financialDiff: number;          // cost impact (positive = loss)
    }>;
}

export interface AssetCountDetails {
    diff: number;                       // total financial difference (positive = loss, negative = gain)
    counts: Record<string, string>;     // raw user input: { assetId → typed value string }
    itemDetails: Array<{
        id: string;
        name: string;
        sysVal: number;                 // system value before count
        realVal: number;                // physical value entered by user
        financialDiff: number;          // sysVal − realVal (positive = loss)
    }>;
}

export interface InitializationDetails {
    isInitialOnboarding: boolean;
    cash: number;
    bank: number;
    inventoryValue: number;
    assetsValue: number;
    inventoryDetails?: InventoryItem[];
    assetDetails?: AssetItem[];
}

/** Union of all recognized transaction detail shapes. */
export type TransactionDetails =
    | PurchaseInventoryDetails
    | PurchaseAssetDetails
    | SaleDetails
    | ExpenseDetails
    | ProductionDetails
    | CashAdjustmentDetails
    | InventoryCountDetails
    | AssetCountDetails
    | InitializationDetails;

export interface Transaction {
    id: string;
    date: string;
    type: 'PURCHASE' | 'SALE' | 'EXPENSE' | 'ADJUSTMENT' | 'PRODUCTION' | 'INITIALIZATION';
    amount: number;
    description: string;
    cogs?: number; // Tracks exact Cost of Goods Sold for reporting correctly by month
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details?: any; // Typed sub-interfaces exported above (TransactionDetails union).
                   // Kept as `any` here so optional-chain reads in revertTransaction /
                   // getLedgerAccounts don't require narrowing casts on every access.
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
    locations: [],
};
