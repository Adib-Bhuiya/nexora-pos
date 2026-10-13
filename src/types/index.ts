export type Role = 'admin' | 'cashier';

/** Mock user for the frontend role-switching demo. NOT real authentication. */
export interface User {
  id: string;
  name: string;
  role: Role;
  initials: string;
}

export type PaymentMethod = 'Cash' | 'Mobile financial service' | 'Card';
export type DiscountType = 'fixed' | 'percent';

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  emoji: string;
  tone: string;
  createdAt: string;
  updatedAt: string;
}

export type ProductInput = Pick<
  Product,
  'name' | 'sku' | 'barcode' | 'category' | 'price' | 'cost' | 'stock' | 'emoji' | 'tone'
>;

export type MovementType = 'initial' | 'sale' | 'restock' | 'adjustment';

export interface StockMovement {
  id: string;
  /** Monotonic sequence; breaks ties between movements created in the same millisecond. */
  seq: number;
  productId: string;
  productName: string;
  sku: string;
  type: MovementType;
  /** Signed quantity change. */
  change: number;
  balanceAfter: number;
  note: string;
  /** e.g. receipt number for sales. */
  reference?: string;
  actorName: string;
  time: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  sku: string;
  qty: number;
  price: number;
  /** Unit cost snapshot, used for profit reporting. */
  cost: number;
}

export type SyncStatus = 'pending' | 'synced';

export interface Sale {
  /** Transaction ID. */
  id: string;
  receipt: string;
  time: string;
  cashierId: string;
  cashierName: string;
  method: PaymentMethod;
  items: SaleItem[];
  subtotal: number;
  discountType: DiscountType;
  discountValue: number;
  discount: number;
  taxLabel: string;
  taxRate: number;
  taxInclusive: boolean;
  tax: number;
  total: number;
  tendered?: number;
  change?: number;
  syncStatus: SyncStatus;
}

export interface Settings {
  storeName: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
  currencyCode: string;
  taxEnabled: boolean;
  taxLabel: string;
  taxRate: number;
  taxInclusive: boolean;
  receiptPrefix: string;
  receiptHeader: string;
  receiptFooter: string;
  receiptShowCashier: boolean;
  receiptShowTaxId: boolean;
  receiptPaper: '58mm' | '80mm';
  autoPrint: boolean;
  lowStockThreshold: number;
  categories: string[];
  autoSync: boolean;
}

export type SyncEntity = 'product' | 'sale' | 'stock_movement' | 'settings';
export type SyncAction = 'create' | 'update' | 'delete';
export type SyncOpStatus = 'pending' | 'failed' | 'synced';

/**
 * One locally-recorded change that a future backend would need to receive.
 * `id` doubles as an idempotency key so a server can safely de-duplicate retries.
 */
export interface SyncOperation {
  id: string;
  /** Monotonic per-device sequence number. Defines replay order. */
  seq: number;
  entity: SyncEntity;
  action: SyncAction;
  entityId: string;
  label: string;
  payload: unknown;
  createdAt: string;
  status: SyncOpStatus;
  attempts: number;
  lastError?: string;
  syncedAt?: string;
  deviceId: string;
}

export type StockStatus = 'good' | 'low' | 'out';
