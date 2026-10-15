import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/config/constants';
import { ValidationError } from '@/lib/validation';
import { createSimulatedTransport, runSync, clearSyncHistory } from '@/services/sync';
import { adjustStock, createProduct, deleteProduct, recordSale, saveSettings, updateProduct, type Actor } from './commands';
import { closeDb } from './idb';
import { buildDemoData, clearAllData, ensureInitialized } from './seed';
import { exportAll, loadSnapshot } from './snapshot';

const actor: Actor = { id: 'u-admin', name: 'Adib' };
const input = (over: Partial<Parameters<typeof createProduct>[0]> = {}) => ({
  name: 'Tea 200g',
  sku: 'TEA-1',
  barcode: '111222',
  category: 'Grocery',
  price: 100,
  cost: 70,
  stock: 10,
  emoji: '☕',
  tone: '#fff0d8',
  ...over,
});

beforeEach(async () => {
  await closeDb();
  await new Promise<void>((res) => {
    const r = indexedDB.deleteDatabase('nexora-pos');
    r.onsuccess = r.onerror = r.onblocked = () => res();
  });
});

describe('first run', () => {
  it('initializes an empty store and keeps it across reloads', async () => {
    await ensureInitialized();
    const a = await loadSnapshot();
    expect(a.products).toHaveLength(0);
    expect(a.sales).toHaveLength(0);
    expect(a.deviceId).toMatch(/^device_/);
    await ensureInitialized();
    const b = await loadSnapshot();
    expect(b.sales).toHaveLength(0);
    expect(b.deviceId).toBe(a.deviceId);
  });

  it('buildDemoData returns clean empty collections', () => {
    const d = buildDemoData();
    expect(d.products).toHaveLength(0);
    expect(d.sales).toHaveLength(0);
    expect(d.movements).toHaveLength(0);
    expect(d.nextReceiptSeq).toBe(1);
  });

  it('can clear to an empty store', async () => {
    await ensureInitialized();
    await clearAllData();
    const s = await loadSnapshot();
    expect(s.products).toHaveLength(0);
    expect(s.sales).toHaveLength(0);
    expect(s.movements).toHaveLength(0);
  });
});

describe('products', () => {
  it('creates a product with an opening-stock movement and queue entries', async () => {
    await clearAllData();
    const p = await createProduct(input(), actor);
    const s = await loadSnapshot();
    expect(s.products).toHaveLength(1);
    expect(s.movements[0]).toMatchObject({ productId: p.id, type: 'initial', change: 10, balanceAfter: 10 });
    expect(s.queue.map((o) => `${o.entity}:${o.action}`)).toEqual(['product:create', 'stock_movement:create']);
    expect(s.queue.every((o) => o.status === 'pending')).toBe(true);
  });

  it('rejects duplicate SKUs and barcodes (case-insensitive) and persists nothing', async () => {
    await clearAllData();
    await createProduct(input(), actor);
    await expect(createProduct(input({ sku: 'tea-1', barcode: '' }), actor)).rejects.toBeInstanceOf(ValidationError);
    await expect(createProduct(input({ sku: 'TEA-2' }), actor)).rejects.toThrow(/barcode/);
    expect((await loadSnapshot()).products).toHaveLength(1);
  });

  it('rejects invalid numbers', async () => {
    await clearAllData();
    await expect(createProduct(input({ price: -1 }), actor)).rejects.toThrow(/Price/);
    await expect(createProduct(input({ stock: 1.5 }), actor)).rejects.toThrow(/whole number/);
    await expect(createProduct(input({ price: NaN }), actor)).rejects.toThrow(ValidationError);
  });

  it('editing stock records an adjustment movement; editing other fields does not', async () => {
    await clearAllData();
    const p = await createProduct(input(), actor);
    await updateProduct(p.id, input({ price: 120 }), actor);
    expect((await loadSnapshot()).movements).toHaveLength(1);
    await updateProduct(p.id, input({ price: 120, stock: 7 }), actor);
    const s = await loadSnapshot();
    expect(s.products[0]).toMatchObject({ price: 120, stock: 7 });
    expect(s.movements[0]).toMatchObject({ type: 'adjustment', change: -3, balanceAfter: 7 });
  });

  it('deleting keeps sales history intact', async () => {
    await clearAllData();
    const p = await createProduct(input(), actor);
    await recordSale({ lines: [{ productId: p.id, qty: 1 }], discountType: 'fixed', discountValue: 0, method: 'Card' }, actor, DEFAULT_SETTINGS);
    await deleteProduct(p.id);
    const s = await loadSnapshot();
    expect(s.products).toHaveLength(0);
    expect(s.sales[0].items[0].name).toBe('Tea 200g');
    expect(s.queue.at(-1)).toMatchObject({ entity: 'product', action: 'delete' });
    const seqs = s.queue.map((o) => o.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });
});

describe('inventory', () => {
  it('restocks and counts', async () => {
    await clearAllData();
    const p = await createProduct(input(), actor);
    const r = await adjustStock(p.id, { kind: 'restock', quantity: 5, note: '' }, actor);
    expect(r).toMatchObject({ type: 'restock', change: 5, balanceAfter: 15, note: 'Restock' });
    const c = await adjustStock(p.id, { kind: 'set', quantity: 12, note: 'Damaged' }, actor);
    expect(c).toMatchObject({ type: 'adjustment', change: -3, balanceAfter: 12 });
    expect((await loadSnapshot()).products[0].stock).toBe(12);
  });
  it('validates quantities', async () => {
    await clearAllData();
    const p = await createProduct(input(), actor);
    await expect(adjustStock(p.id, { kind: 'restock', quantity: 0, note: '' }, actor)).rejects.toThrow(/at least 1/);
    await expect(adjustStock(p.id, { kind: 'set', quantity: 10, note: '' }, actor)).rejects.toThrow(/unchanged/);
    await expect(adjustStock(p.id, { kind: 'set', quantity: -2, note: '' }, actor)).rejects.toThrow(/negative/);
  });
});

describe('recordSale', () => {
  it('decrements stock, writes movements, numbers the receipt and queues everything atomically', async () => {
    await clearAllData();
    const a = await createProduct(input(), actor);
    const b = await createProduct(input({ name: 'Sugar', sku: 'SG-1', barcode: '', price: 50, cost: 40, stock: 4 }), actor);
    const sale = await recordSale(
      { lines: [{ productId: a.id, qty: 2 }, { productId: b.id, qty: 4 }], discountType: 'percent', discountValue: 10, method: 'Cash', tendered: 500 },
      { id: 'u-cash-1', name: 'Rafi Hasan' },
      DEFAULT_SETTINGS,
    );
    expect(sale).toMatchObject({ receipt: 'NX-00001', subtotal: 400, discount: 40, total: 360, tendered: 500, change: 140, syncStatus: 'pending', cashierName: 'Rafi Hasan' });
    expect(sale.id).toMatch(/^TXN-/);
    const s = await loadSnapshot();
    expect(s.products.find((p) => p.id === a.id)?.stock).toBe(8);
    expect(s.products.find((p) => p.id === b.id)?.stock).toBe(0);
    const sm = s.movements.filter((m) => m.type === 'sale');
    expect(sm).toHaveLength(2);
    expect(sm.every((m) => m.reference === 'NX-00001')).toBe(true);
    expect(s.queue.filter((o) => o.entity === 'sale')).toHaveLength(1);
    const second = await recordSale({ lines: [{ productId: a.id, qty: 1 }], discountType: 'fixed', discountValue: 0, method: 'Card' }, actor, DEFAULT_SETTINGS);
    expect(second.receipt).toBe('NX-00002');
    expect(second.tendered).toBeUndefined();
  });

  it('rolls back everything when any line lacks stock', async () => {
    await clearAllData();
    const a = await createProduct(input(), actor);
    const b = await createProduct(input({ sku: 'X', barcode: '', stock: 1 }), actor);
    const before = await loadSnapshot();
    await expect(
      recordSale({ lines: [{ productId: a.id, qty: 3 }, { productId: b.id, qty: 2 }], discountType: 'fixed', discountValue: 0, method: 'Card' }, actor, DEFAULT_SETTINGS),
    ).rejects.toThrow(/only 1 in stock/);
    const after = await loadSnapshot();
    expect(after.products.map((p) => p.stock).sort()).toEqual(before.products.map((p) => p.stock).sort());
    expect(after.sales).toHaveLength(0);
    expect(after.queue).toHaveLength(before.queue.length);
    // receipt counter was not consumed by the failed sale
    const ok = await recordSale({ lines: [{ productId: a.id, qty: 1 }], discountType: 'fixed', discountValue: 0, method: 'Card' }, actor, DEFAULT_SETTINGS);
    expect(ok.receipt).toBe('NX-00001');
  });

  it('validates input', async () => {
    await clearAllData();
    const a = await createProduct(input(), actor);
    const run = (over: object) =>
      recordSale({ lines: [{ productId: a.id, qty: 1 }], discountType: 'fixed', discountValue: 0, method: 'Cash', ...over }, actor, DEFAULT_SETTINGS);
    await expect(recordSale({ lines: [], discountType: 'fixed', discountValue: 0, method: 'Cash' }, actor, DEFAULT_SETTINGS)).rejects.toThrow(/Add a product/);
    await expect(run({ lines: [{ productId: a.id, qty: 0 }] })).rejects.toThrow(/whole numbers/);
    await expect(run({ lines: [{ productId: 'nope', qty: 1 }] })).rejects.toThrow(/no longer exists/);
    await expect(run({ discountType: 'percent', discountValue: 120 })).rejects.toThrow(/100%/);
    await expect(run({ discountValue: 100 })).rejects.toThrow(/greater than zero/);
    await expect(run({ tendered: 50 })).rejects.toThrow(/less than the total/);
  });

  it('applies the configured tax', async () => {
    await clearAllData();
    const a = await createProduct(input(), actor);
    const sale = await recordSale(
      { lines: [{ productId: a.id, qty: 2 }], discountType: 'fixed', discountValue: 0, method: 'Card' },
      actor,
      { ...DEFAULT_SETTINGS, taxEnabled: true, taxLabel: 'VAT', taxRate: 5, taxInclusive: false },
    );
    expect(sale).toMatchObject({ subtotal: 200, tax: 10, total: 210, taxLabel: 'VAT', taxRate: 5 });
  });

  it('two simultaneous sales of the last unit: exactly one wins', async () => {
    await clearAllData();
    const a = await createProduct(input({ stock: 1 }), actor);
    const attempt = () => recordSale({ lines: [{ productId: a.id, qty: 1 }], discountType: 'fixed', discountValue: 0, method: 'Card' }, actor, DEFAULT_SETTINGS);
    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const s = await loadSnapshot();
    expect(s.products[0].stock).toBe(0);
    expect(s.sales).toHaveLength(1);
  });
});

describe('simulated sync', () => {
  it('drains the queue, marks sales synced, and keeps a history', async () => {
    await clearAllData();
    const a = await createProduct(input(), actor);
    await recordSale({ lines: [{ productId: a.id, qty: 1 }], discountType: 'fixed', discountValue: 0, method: 'Card' }, actor, DEFAULT_SETTINGS);
    expect((await loadSnapshot()).sales[0].syncStatus).toBe('pending');
    const res = await runSync(createSimulatedTransport({ delayMs: 0 }));
    expect(res.failed).toBe(0);
    expect(res.synced).toBeGreaterThan(0);
    const s = await loadSnapshot();
    expect(s.sales[0].syncStatus).toBe('synced');
    expect(s.queue.every((o) => o.status === 'synced' && o.syncedAt)).toBe(true);
    await clearSyncHistory();
    expect((await loadSnapshot()).queue).toHaveLength(0);
  });

  it('marks failures, keeps them for retry, and a retry succeeds', async () => {
    await clearAllData();
    await createProduct(input(), actor);
    let fail = true;
    const t = createSimulatedTransport({ delayMs: 0, shouldFail: () => fail });
    const r1 = await runSync(t);
    expect(r1.synced).toBe(0);
    let q = (await loadSnapshot()).queue;
    expect(q.every((o) => o.status === 'failed' && o.attempts === 1 && o.lastError)).toBe(true);
    // auto-sync only retries "pending" → failed ops stay put until a manual retry
    expect((await runSync(t, ['pending'])).synced).toBe(0);
    fail = false;
    const r2 = await runSync(t);
    expect(r2.failed).toBe(0);
    q = (await loadSnapshot()).queue;
    expect(q.every((o) => o.status === 'synced' && o.attempts === 2)).toBe(true);
  });

  it('treats a throwing transport as a failed batch', async () => {
    await clearAllData();
    await createProduct(input(), actor);
    const r = await runSync({ name: 'broken', push: async () => { throw new Error('boom'); } });
    expect(r.failed).toBeGreaterThan(0);
    expect((await loadSnapshot()).queue[0].lastError).toBe('boom');
  });

  it('queues settings changes and exports a full backup', async () => {
    await clearAllData();
    await saveSettings({ ...DEFAULT_SETTINGS, storeName: 'My Shop' });
    const s = await loadSnapshot();
    expect(s.settings.storeName).toBe('My Shop');
    expect(s.queue.some((o) => o.entity === 'settings')).toBe(true);
    const json = JSON.parse(await exportAll());
    expect(json.app).toBe('nexora-pos');
    expect(json.settings.storeName).toBe('My Shop');
  });
});
