import { DEFAULT_SETTINGS, MOCK_USERS, PAYMENT_METHODS } from '@/config/constants';
import { computeTotals } from '@/lib/calc';
import { uid } from '@/lib/id';
import type { PaymentMethod, Product, Sale, StockMovement } from '@/types';
import { transaction } from './idb';

interface BaseProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  price: number;
  cost: number;
  /** Stock the demo should end with today. */
  finalStock: number;
  emoji: string;
  tone: string;
  /** Relative popularity when generating demo sales. */
  weight: number;
}

const BASE: BaseProduct[] = [
  { id: 'p1', name: 'Premium Rice 1kg', sku: 'GR-1001', barcode: '8800010010011', category: 'Grocery', price: 85, cost: 70, finalStock: 18, emoji: '🍚', tone: '#fff4dd', weight: 2.5 },
  { id: 'p2', name: 'Cooking Oil 1L', sku: 'GR-1002', barcode: '8800010020018', category: 'Grocery', price: 178, cost: 150, finalStock: 4, emoji: '🫗', tone: '#fff0d8', weight: 1.2 },
  { id: 'p3', name: 'Instant Noodles', sku: 'GR-1003', barcode: '8800010030015', category: 'Grocery', price: 25, cost: 19, finalStock: 35, emoji: '🍜', tone: '#ffede5', weight: 3 },
  { id: 'p4', name: 'Mineral Water', sku: 'BV-2001', barcode: '8800020010016', category: 'Beverages', price: 20, cost: 13, finalStock: 26, emoji: '💧', tone: '#e6f5ff', weight: 3 },
  { id: 'p5', name: 'Orange Juice', sku: 'BV-2002', barcode: '8800020020013', category: 'Beverages', price: 65, cost: 48, finalStock: 12, emoji: '🧃', tone: '#fff0db', weight: 2 },
  { id: 'p6', name: 'Laundry Powder', sku: 'HH-3001', barcode: '8800030010010', category: 'Household', price: 145, cost: 118, finalStock: 3, emoji: '🧺', tone: '#edf2ff', weight: 0.8 },
  { id: 'p7', name: 'Bath Soap', sku: 'PC-4001', barcode: '8800040010017', category: 'Personal care', price: 48, cost: 35, finalStock: 20, emoji: '🧼', tone: '#f1eaff', weight: 1.5 },
  { id: 'p8', name: 'Toothpaste', sku: 'PC-4002', barcode: '8800040020014', category: 'Personal care', price: 95, cost: 72, finalStock: 11, emoji: '🪥', tone: '#e4f8ed', weight: 1.2 },
];

const RESTOCKS = [
  { productId: 'p3', daysAgo: 15, qty: 30 },
  { productId: 'p1', daysAgo: 8, qty: 20 },
  { productId: 'p4', daysAgo: 12, qty: 24 },
];

const DAYS = 30;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoData {
  products: Product[];
  sales: Sale[];
  movements: StockMovement[];
  nextReceiptSeq: number;
}

/** Deterministic demo data: 30 days of sales whose stock movements add up to today's stock. */
export function buildDemoData(now = new Date()): DemoData {
  const rand = mulberry32(20260101);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (DAYS - 1), 8, 0, 0);
  const startIso = start.toISOString();
  const admin = MOCK_USERS[0];

  // ---- 1. generate sales ----
  interface Draft {
    time: Date;
    lines: { base: BaseProduct; qty: number }[];
    method: PaymentMethod;
    cashier: (typeof MOCK_USERS)[number];
    discount: number;
  }
  const drafts: Draft[] = [];
  const pick = (): BaseProduct => {
    const total = BASE.reduce((n, b) => n + b.weight, 0);
    let r = rand() * total;
    for (const b of BASE) {
      r -= b.weight;
      if (r <= 0) return b;
    }
    return BASE[0];
  };

  for (let off = DAYS - 1; off >= 0; off--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - off);
    const count = 4 + Math.floor(rand() * 5);
    for (let i = 0; i < count; i++) {
      let time: Date;
      if (off === 0) {
        const from = Math.max(day.getTime(), now.getTime() - 6 * 3600_000);
        time = new Date(from + rand() * (now.getTime() - 60_000 - from));
        if (time.getTime() >= now.getTime()) continue;
      } else {
        time = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, Math.floor(rand() * 12 * 60));
      }
      const used = new Set<string>();
      const lines: Draft['lines'] = [];
      const n = 1 + Math.floor(rand() * 4);
      while (lines.length < n) {
        const b = pick();
        if (used.has(b.id)) continue;
        used.add(b.id);
        lines.push({ base: b, qty: 1 + Math.floor(rand() * 3) });
      }
      const m = rand();
      drafts.push({
        time,
        lines,
        method: m < 0.55 ? PAYMENT_METHODS[0] : m < 0.85 ? PAYMENT_METHODS[1] : PAYMENT_METHODS[2],
        cashier: MOCK_USERS[rand() < 0.25 ? 0 : rand() < 0.55 ? 1 : 2],
        discount: rand() < 0.1 ? [5, 10, 20][Math.floor(rand() * 3)] : 0,
      });
    }
  }
  drafts.sort((a, b) => a.time.getTime() - b.time.getTime());

  const sales: Sale[] = drafts.map((d, i) => {
    const items = d.lines.map((l) => ({
      productId: l.base.id,
      name: l.base.name,
      sku: l.base.sku,
      qty: l.qty,
      price: l.base.price,
      cost: l.base.cost,
    }));
    const t = computeTotals(items, { type: 'fixed', value: d.discount }, { enabled: false, rate: 0, inclusive: false });
    return {
      id: `TXN-DEMO${String(i + 1).padStart(5, '0')}`,
      receipt: `${DEFAULT_SETTINGS.receiptPrefix}-${String(i + 1).padStart(5, '0')}`,
      time: d.time.toISOString(),
      cashierId: d.cashier.id,
      cashierName: d.cashier.name,
      method: d.method,
      items,
      subtotal: t.subtotal,
      discountType: 'fixed' as const,
      discountValue: d.discount,
      discount: t.discount,
      taxLabel: '',
      taxRate: 0,
      taxInclusive: false,
      tax: 0,
      total: t.total,
      tendered: d.method === 'Cash' ? Math.ceil(t.total / 10) * 10 : undefined,
      change: d.method === 'Cash' ? Math.ceil(t.total / 10) * 10 - t.total : undefined,
      syncStatus: 'synced' as const,
    };
  });

  // ---- 2. derive opening stock so the history ends at today's stock ----
  const sold = new Map<string, number>();
  for (const s of sales) for (const i of s.items) sold.set(i.productId, (sold.get(i.productId) ?? 0) + i.qty);

  type Event = { time: number; productId: string; change: number; type: StockMovement['type']; note: string; ref?: string };
  const events: Event[] = [];
  for (const s of sales)
    for (const i of s.items)
      events.push({ time: Date.parse(s.time), productId: i.productId, change: -i.qty, type: 'sale', note: `Sale ${s.receipt}`, ref: s.receipt });
  for (const r of RESTOCKS) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - r.daysAgo, 8, 30);
    events.push({ time: at.getTime(), productId: r.productId, change: r.qty, type: 'restock', note: 'Supplier delivery', ref: undefined });
  }
  events.sort((a, b) => a.time - b.time);

  const movements: StockMovement[] = [];
  const products: Product[] = [];
  for (const b of BASE) {
    const restocked = RESTOCKS.filter((r) => r.productId === b.id).reduce((n, r) => n + r.qty, 0);
    let opening = b.finalStock + (sold.get(b.id) ?? 0) - restocked;
    // Make sure the running balance never dips below zero mid-history.
    let run = opening;
    let min = run;
    for (const e of events) if (e.productId === b.id) min = Math.min(min, (run += e.change));
    const deficit = min < 0 ? -min : 0;
    opening += deficit;

    const mk = (type: StockMovement['type'], change: number, balance: number, note: string, time: string, ref?: string): StockMovement => ({
      id: uid('mv'),
      seq: 0,
      productId: b.id,
      productName: b.name,
      sku: b.sku,
      type,
      change,
      balanceAfter: balance,
      note,
      reference: ref,
      actorName: admin.name,
      time,
    });

    let balance = opening;
    movements.push(mk('initial', opening, opening, 'Opening stock', startIso));
    for (const e of events) {
      if (e.productId !== b.id) continue;
      balance += e.change;
      const actor = e.type === 'sale' ? sales.find((s) => s.receipt === e.ref)?.cashierName : admin.name;
      const m = mk(e.type, e.change, balance, e.note, new Date(e.time).toISOString(), e.ref);
      m.actorName = actor ?? admin.name;
      movements.push(m);
    }
    if (deficit > 0) {
      balance -= deficit;
      movements.push(mk('adjustment', -deficit, balance, 'Stock count correction', new Date(now.getTime() - 1000).toISOString()));
    }
    products.push({
      id: b.id,
      name: b.name,
      sku: b.sku,
      barcode: b.barcode,
      category: b.category,
      price: b.price,
      cost: b.cost,
      stock: balance,
      emoji: b.emoji,
      tone: b.tone,
      createdAt: startIso,
      updatedAt: startIso,
    });
  }

  movements.sort((a, b) => a.time.localeCompare(b.time));
  movements.forEach((m, i) => (m.seq = i + 1));
  return { products, sales, movements, nextReceiptSeq: sales.length + 1 };
}

/** Replace products, sales, movements and the sync queue with fresh demo data. */
export async function seedDemo(opts: { resetSettings?: boolean } = {}): Promise<void> {
  const data = buildDemoData();
  await transaction(['products', 'sales', 'movements', 'settings', 'syncQueue', 'meta'], 'readwrite', async (s) => {
    await Promise.all([s.products.clear(), s.sales.clear(), s.movements.clear(), s.syncQueue.clear()]);
    await Promise.all([
      ...data.products.map((p) => s.products.put(p)),
      ...data.sales.map((x) => s.sales.put(x)),
      ...data.movements.map((m) => s.movements.put(m)),
    ]);
    await s.meta.put({ key: 'receiptSeq', value: data.nextReceiptSeq });
    await s.meta.put({ key: 'mvSeq', value: data.movements.length });
    await s.meta.put({ key: 'seeded', value: true });
    if (opts.resetSettings || !(await s.settings.get('app'))) await s.settings.put({ key: 'app', value: DEFAULT_SETTINGS });
  });
}

/** Empty store: no products, sales, movements or queue. Settings are kept. */
export async function clearAllData(): Promise<void> {
  await transaction(['products', 'sales', 'movements', 'syncQueue', 'meta'], 'readwrite', async (s) => {
    await Promise.all([s.products.clear(), s.sales.clear(), s.movements.clear(), s.syncQueue.clear()]);
    await s.meta.put({ key: 'receiptSeq', value: 1 });
    await s.meta.put({ key: 'mvSeq', value: 0 });
    await s.meta.put({ key: 'seeded', value: true });
  });
}

/** First run: create a device id and load the demo data once. */
export async function ensureInitialized(): Promise<void> {
  const needsSeed = await transaction(['meta'], 'readwrite', async (s) => {
    if (!(await s.meta.get('deviceId'))) await s.meta.put({ key: 'deviceId', value: uid('device') });
    return !(await s.meta.get('seeded'));
  });
  if (needsSeed) await seedDemo({ resetSettings: true });
}
