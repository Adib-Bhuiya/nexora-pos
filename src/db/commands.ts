import { computeTotals, changeDue, round2 } from '@/lib/calc';
import { txnId, uid } from '@/lib/id';
import { ValidationError } from '@/lib/validation';
import type {
  DiscountType,
  PaymentMethod,
  Product,
  ProductInput,
  Sale,
  Settings,
  StockMovement,
  SyncAction,
  SyncEntity,
  SyncOperation,
} from '@/types';
import { transaction, type TxStores } from './idb';

/**
 * Data-access commands. Each one is a single atomic IndexedDB transaction that
 * writes the change, the stock movement(s) and the pending-sync entries together.
 * These are the functions a backend-aware version would call a server from.
 */
export interface Actor {
  id: string;
  name: string;
}

const nowIso = () => new Date().toISOString();

async function getDeviceId(s: TxStores): Promise<string> {
  const rec = await s.meta.get('deviceId');
  if (rec) return rec.value as string;
  const value = uid('device');
  await s.meta.put({ key: 'deviceId', value });
  return value;
}

function makeOp(
  deviceId: string,
  entity: SyncEntity,
  action: SyncAction,
  entityId: string,
  label: string,
  payload: unknown,
): SyncOperation {
  return {
    id: uid('op'),
    seq: 0, // assigned in enqueue()
    entity,
    action,
    entityId,
    label,
    payload,
    createdAt: nowIso(),
    status: 'pending',
    attempts: 0,
    deviceId,
  };
}

/** Write ops with a monotonic sequence number so replay order is always stable. */
async function enqueue(s: TxStores, ops: SyncOperation[]): Promise<void> {
  const rec = await s.meta.get('opSeq');
  let seq = typeof rec?.value === 'number' ? rec.value : 0;
  for (const op of ops) {
    op.seq = ++seq;
    await s.syncQueue.put(op);
  }
  await s.meta.put({ key: 'opSeq', value: seq });
}

function movement(
  p: Pick<Product, 'id' | 'name' | 'sku'>,
  type: StockMovement['type'],
  change: number,
  balanceAfter: number,
  note: string,
  actor: Actor,
  reference?: string,
): StockMovement {
  return {
    id: uid('mv'),
    seq: 0, // assigned in saveMovement()
    productId: p.id,
    productName: p.name,
    sku: p.sku,
    type,
    change,
    balanceAfter,
    note,
    reference,
    actorName: actor.name,
    time: nowIso(),
  };
}

async function saveMovement(s: TxStores, m: StockMovement): Promise<void> {
  const rec = await s.meta.get('mvSeq');
  m.seq = (typeof rec?.value === 'number' ? rec.value : 0) + 1;
  await s.meta.put({ key: 'mvSeq', value: m.seq });
  await s.movements.put(m);
}

function assertUnique(all: Product[], input: ProductInput, selfId?: string) {
  const others = all.filter((p) => p.id !== selfId);
  if (others.some((p) => p.sku.toLowerCase() === input.sku.trim().toLowerCase()))
    throw new ValidationError('This SKU is already used by another product.');
  if (input.barcode && others.some((p) => p.barcode && p.barcode.toLowerCase() === input.barcode.toLowerCase()))
    throw new ValidationError('This barcode is already used by another product.');
}

const checkMoney = (n: number, field: string) => {
  if (!Number.isFinite(n) || n < 0) throw new ValidationError(`${field} must be 0 or more.`);
};
const checkStock = (n: number) => {
  if (!Number.isInteger(n) || n < 0) throw new ValidationError('Stock must be a whole number, 0 or more.');
};

export async function createProduct(
  input: ProductInput,
  actor: Actor,
  productId?: string,
): Promise<Product> {
  checkMoney(input.price, 'Price');
  checkMoney(input.cost, 'Cost');
  checkStock(input.stock);
  if (!input.name.trim() || !input.sku.trim()) throw new ValidationError('Name and SKU are required.');

  return transaction(['products', 'movements', 'syncQueue', 'meta'], 'readwrite', async (s) => {
    assertUnique(await s.products.getAll(), input);
    const at = nowIso();
    const product: Product = {
      id: productId ?? uid('prod'),
      ...input,
      createdAt: at,
      updatedAt: at,
    };
    await s.products.put(product);
    const device = await getDeviceId(s);
    const ops = [makeOp(device, 'product', 'create', product.id, `Create product ${product.name}`, product)];
    if (product.stock > 0) {
      const m = movement(product, 'initial', product.stock, product.stock, 'Opening stock', actor);
      await saveMovement(s, m);
      ops.push(makeOp(device, 'stock_movement', 'create', m.id, `Opening stock · ${product.name}`, m));
    }
    await enqueue(s, ops);
    return product;
  });
}

export async function updateProduct(id: string, input: ProductInput, actor: Actor): Promise<Product> {
  checkMoney(input.price, 'Price');
  checkMoney(input.cost, 'Cost');
  checkStock(input.stock);
  if (!input.name.trim() || !input.sku.trim()) throw new ValidationError('Name and SKU are required.');

  return transaction(['products', 'movements', 'syncQueue', 'meta'], 'readwrite', async (s) => {
    const current = await s.products.get(id);
    if (!current) throw new ValidationError('This product no longer exists.');
    assertUnique(await s.products.getAll(), input, id);
    const next: Product = { ...current, ...input, updatedAt: nowIso() };
    await s.products.put(next);
    const device = await getDeviceId(s);
    const ops = [makeOp(device, 'product', 'update', id, `Update product ${next.name}`, next)];
    if (next.stock !== current.stock) {
      const m = movement(next, 'adjustment', next.stock - current.stock, next.stock, 'Edited in product form', actor);
      await saveMovement(s, m);
      ops.push(makeOp(device, 'stock_movement', 'create', m.id, `Stock adjustment · ${next.name}`, m));
    }
    await enqueue(s, ops);
    return next;
  });
}

export async function deleteProduct(id: string): Promise<void> {
  await transaction(['products', 'syncQueue', 'meta'], 'readwrite', async (s) => {
    const current = await s.products.get(id);
    if (!current) return;
    await s.products.delete(id);
    const device = await getDeviceId(s);
    // Past sales and movements keep their own snapshot of the product name.
    await enqueue(s, [makeOp(device, 'product', 'delete', id, `Delete product ${current.name}`, { id })]);
  });
}

export type StockAdjustment =
  | { kind: 'restock'; quantity: number; note: string }
  /** `quantity` is the NEW counted total. */
  | { kind: 'set'; quantity: number; note: string };

export async function adjustStock(productId: string, adj: StockAdjustment, actor: Actor): Promise<StockMovement> {
  if (!Number.isInteger(adj.quantity)) throw new ValidationError('Quantity must be a whole number.');
  if (adj.kind === 'restock' && adj.quantity < 1) throw new ValidationError('Restock quantity must be at least 1.');
  if (adj.kind === 'set' && adj.quantity < 0) throw new ValidationError('Counted quantity cannot be negative.');

  return transaction(['products', 'movements', 'syncQueue', 'meta'], 'readwrite', async (s) => {
    const p = await s.products.get(productId);
    if (!p) throw new ValidationError('This product no longer exists.');
    const next = adj.kind === 'restock' ? p.stock + adj.quantity : adj.quantity;
    const change = next - p.stock;
    if (change === 0) throw new ValidationError('The count is unchanged.');
    const updated: Product = { ...p, stock: next, updatedAt: nowIso() };
    await s.products.put(updated);
    const m = movement(
      p,
      adj.kind === 'restock' ? 'restock' : 'adjustment',
      change,
      next,
      adj.note.trim() || (adj.kind === 'restock' ? 'Restock' : 'Stock adjustment'),
      actor,
    );
    await saveMovement(s, m);
    const device = await getDeviceId(s);
    await enqueue(s, [
      makeOp(device, 'product', 'update', p.id, `Update stock · ${p.name}`, updated),
      makeOp(device, 'stock_movement', 'create', m.id, `${adj.kind === 'restock' ? 'Restock' : 'Adjust'} · ${p.name}`, m),
    ]);
    return m;
  });
}

export interface SaleInput {
  lines: { productId: string; qty: number }[];
  discountType: DiscountType;
  discountValue: number;
  method: PaymentMethod;
  /** Cash handed over by the customer (Cash payments only). Defaults to the total. */
  tendered?: number;
}

export async function recordSale(
  input: SaleInput,
  actor: Actor,
  settings: Pick<Settings, 'receiptPrefix' | 'taxEnabled' | 'taxLabel' | 'taxRate' | 'taxInclusive'>,
): Promise<Sale> {
  // Merge duplicate lines defensively.
  const wanted = new Map<string, number>();
  for (const l of input.lines) wanted.set(l.productId, (wanted.get(l.productId) ?? 0) + l.qty);
  if (wanted.size === 0) throw new ValidationError('Add a product before checkout.');
  for (const q of wanted.values()) {
    if (!Number.isInteger(q) || q < 1) throw new ValidationError('Quantities must be whole numbers of at least 1.');
  }
  if (input.discountType === 'percent' && input.discountValue > 100)
    throw new ValidationError('A percentage discount cannot exceed 100%.');

  return transaction(['products', 'sales', 'movements', 'syncQueue', 'meta'], 'readwrite', async (s) => {
    const entries = [...wanted.entries()];
    const found = await Promise.all(entries.map(([id]) => s.products.get(id)));
    const items: Sale['items'] = [];
    const updates: Product[] = [];
    for (let i = 0; i < entries.length; i++) {
      const p = found[i];
      const qty = entries[i][1];
      if (!p) throw new ValidationError('A product in the cart no longer exists. Review the cart.');
      if (p.stock < qty)
        throw new ValidationError(p.stock < 1 ? `${p.name} is out of stock.` : `${p.name}: only ${p.stock} in stock.`);
      items.push({ productId: p.id, name: p.name, sku: p.sku, qty, price: p.price, cost: p.cost });
      updates.push({ ...p, stock: p.stock - qty, updatedAt: nowIso() });
    }

    const totals = computeTotals(
      items,
      { type: input.discountType, value: input.discountValue },
      { enabled: settings.taxEnabled, rate: settings.taxRate, inclusive: settings.taxInclusive },
    );
    if (totals.total <= 0) throw new ValidationError('The total must be greater than zero.');

    let tendered: number | undefined;
    let change: number | undefined;
    if (input.method === 'Cash') {
      tendered = round2(input.tendered ?? totals.total);
      if (tendered < totals.total) throw new ValidationError('Amount received is less than the total.');
      change = changeDue(tendered, totals.total);
    }

    const seqRec = await s.meta.get('receiptSeq');
    const seq = typeof seqRec?.value === 'number' ? seqRec.value : 1;
    await s.meta.put({ key: 'receiptSeq', value: seq + 1 });

    const at = new Date();
    const sale: Sale = {
      id: txnId(at),
      receipt: `${settings.receiptPrefix}-${String(seq).padStart(5, '0')}`,
      time: at.toISOString(),
      cashierId: actor.id,
      cashierName: actor.name,
      method: input.method,
      items,
      subtotal: totals.subtotal,
      discountType: input.discountType,
      discountValue: Math.max(0, input.discountValue || 0),
      discount: totals.discount,
      taxLabel: settings.taxEnabled ? settings.taxLabel : '',
      taxRate: settings.taxEnabled ? settings.taxRate : 0,
      taxInclusive: settings.taxEnabled ? settings.taxInclusive : false,
      tax: totals.tax,
      total: totals.total,
      tendered,
      change,
      syncStatus: 'pending',
    };
    await s.sales.put(sale);

    const device = await getDeviceId(s);
    const ops = [makeOp(device, 'sale', 'create', sale.id, `Sale ${sale.receipt}`, sale)];
    for (const u of updates) {
      await s.products.put(u);
      const qty = wanted.get(u.id) ?? 0;
      const m = movement(u, 'sale', -qty, u.stock, `Sale ${sale.receipt}`, actor, sale.receipt);
      await saveMovement(s, m);
      ops.push(makeOp(device, 'stock_movement', 'create', m.id, `Sale stock · ${u.name}`, m));
    }
    await enqueue(s, ops);
    return sale;
  });
}

export async function saveSettings(settings: Settings): Promise<void> {
  await transaction(['settings', 'syncQueue', 'meta'], 'readwrite', async (s) => {
    await s.settings.put({ key: 'app', value: settings });
    const device = await getDeviceId(s);
    await enqueue(s, [makeOp(device, 'settings', 'update', 'app', 'Update store settings', settings)]);
  });
}

export async function setSessionUser(userId: string): Promise<void> {
  await transaction(['meta'], 'readwrite', async (s) => {
    await s.meta.put({ key: 'sessionUserId', value: userId });
  });
}
