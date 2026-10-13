import type { PaymentMethod, Product, Sale } from '@/types';
import { round2, stockStatus } from './calc';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local-time day key, e.g. 2026-10-12. */
export const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const saleCogs = (s: Sale): number => round2(s.items.reduce((n, i) => n + i.cost * i.qty, 0));
/** Revenue net of collected tax (tax is not income). */
export const saleNet = (s: Sale): number => round2(s.total - s.tax);
export const saleProfit = (s: Sale): number => round2(saleNet(s) - saleCogs(s));
export const saleUnits = (s: Sale): number => s.items.reduce((n, i) => n + i.qty, 0);

export interface PeriodRow {
  key: string;
  label: string;
  orders: number;
  units: number;
  revenue: number;
  discount: number;
  tax: number;
  profit: number;
}

const emptyRow = (key: string, label: string): PeriodRow => ({
  key,
  label,
  orders: 0,
  units: 0,
  revenue: 0,
  discount: 0,
  tax: 0,
  profit: 0,
});

function accumulate(row: PeriodRow, s: Sale) {
  row.orders += 1;
  row.units += saleUnits(s);
  row.revenue = round2(row.revenue + s.total);
  row.discount = round2(row.discount + s.discount);
  row.tax = round2(row.tax + s.tax);
  row.profit = round2(row.profit + saleProfit(s));
}

/** Oldest → newest, including days with no sales. */
export function salesByDay(sales: Sale[], days: number, now = new Date(), locale = 'en'): PeriodRow[] {
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const rows = new Map<string, PeriodRow>();
  const today = startOfDay(now);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    rows.set(dayKey(d), emptyRow(dayKey(d), fmt.format(d)));
  }
  for (const s of sales) {
    const row = rows.get(dayKey(new Date(s.time)));
    if (row) accumulate(row, s);
  }
  return [...rows.values()];
}

export function salesByMonth(sales: Sale[], months: number, now = new Date(), locale = 'en'): PeriodRow[] {
  const fmt = new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' });
  const rows = new Map<string, PeriodRow>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    rows.set(monthKey(d), emptyRow(monthKey(d), fmt.format(d)));
  }
  for (const s of sales) {
    const row = rows.get(monthKey(new Date(s.time)));
    if (row) accumulate(row, s);
  }
  return [...rows.values()];
}

export const sumRows = (rows: PeriodRow[]): PeriodRow =>
  rows.reduce((acc, r) => {
    acc.orders += r.orders;
    acc.units += r.units;
    acc.revenue = round2(acc.revenue + r.revenue);
    acc.discount = round2(acc.discount + r.discount);
    acc.tax = round2(acc.tax + r.tax);
    acc.profit = round2(acc.profit + r.profit);
    return acc;
  }, emptyRow('total', 'Total'));

export interface BestSeller {
  productId: string;
  name: string;
  units: number;
  revenue: number;
  profit: number;
}

export function bestSellers(sales: Sale[], limit = 8): BestSeller[] {
  const map = new Map<string, BestSeller>();
  for (const s of sales) {
    for (const i of s.items) {
      const b = map.get(i.productId) ?? { productId: i.productId, name: i.name, units: 0, revenue: 0, profit: 0 };
      b.units += i.qty;
      b.revenue = round2(b.revenue + i.price * i.qty);
      b.profit = round2(b.profit + (i.price - i.cost) * i.qty);
      map.set(i.productId, b);
    }
  }
  return [...map.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, limit);
}

export interface PaymentShare {
  method: PaymentMethod;
  total: number;
  count: number;
  share: number;
}

export function paymentBreakdown(sales: Sale[], methods: PaymentMethod[]): PaymentShare[] {
  const revenue = sales.reduce((n, s) => n + s.total, 0);
  return methods.map((method) => {
    const subset = sales.filter((s) => s.method === method);
    const total = round2(subset.reduce((n, s) => n + s.total, 0));
    return { method, total, count: subset.length, share: revenue ? total / revenue : 0 };
  });
}

export interface InventoryReport {
  products: number;
  units: number;
  costValue: number;
  retailValue: number;
  potentialProfit: number;
  low: Product[];
  out: Product[];
}

export function inventoryReport(products: Product[], threshold: number): InventoryReport {
  let units = 0;
  let costValue = 0;
  let retailValue = 0;
  const low: Product[] = [];
  const out: Product[] = [];
  for (const p of products) {
    units += p.stock;
    costValue += p.cost * p.stock;
    retailValue += p.price * p.stock;
    const st = stockStatus(p.stock, threshold);
    if (st === 'low') low.push(p);
    if (st === 'out') out.push(p);
  }
  return {
    products: products.length,
    units,
    costValue: round2(costValue),
    retailValue: round2(retailValue),
    potentialProfit: round2(retailValue - costValue),
    low: low.sort((a, b) => a.stock - b.stock),
    out,
  };
}
