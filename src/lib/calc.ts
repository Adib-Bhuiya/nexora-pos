import type { DiscountType, StockStatus } from '@/types';

/** Round to 2 decimal places (money). */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Number from a text input. Empty or invalid text gives NaN. */
export const parseNumber = (s: string): number => (s.trim() === '' ? NaN : Number(s));

export interface PricedLine {
  price: number;
  qty: number;
}
export interface DiscountInput {
  type: DiscountType;
  value: number;
}
export interface TaxConfig {
  enabled: boolean;
  /** Percent, e.g. 5 for 5%. */
  rate: number;
  /** When true, listed prices already include tax. */
  inclusive: boolean;
}

export interface Totals {
  itemCount: number;
  subtotal: number;
  /** Discount actually applied (clamped). */
  discount: number;
  taxable: number;
  tax: number;
  total: number;
}

export function computeTotals(lines: PricedLine[], discount: DiscountInput, tax: TaxConfig): Totals {
  const itemCount = lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = round2(lines.reduce((s, l) => s + l.price * l.qty, 0));

  const raw = Number.isFinite(discount.value) ? Math.max(0, discount.value) : 0;
  const applied =
    discount.type === 'percent' ? round2((subtotal * Math.min(raw, 100)) / 100) : Math.min(round2(raw), subtotal);

  const taxable = round2(subtotal - applied);
  let taxAmount = 0;
  let total = taxable;
  if (tax.enabled && tax.rate > 0) {
    if (tax.inclusive) {
      taxAmount = round2(taxable - taxable / (1 + tax.rate / 100));
    } else {
      taxAmount = round2((taxable * tax.rate) / 100);
      total = round2(taxable + taxAmount);
    }
  }
  return { itemCount, subtotal, discount: applied, taxable, tax: taxAmount, total };
}

export const changeDue = (tendered: number, total: number): number => round2(Math.max(0, tendered - total));

export function stockStatus(stock: number, threshold: number): StockStatus {
  if (stock <= 0) return 'out';
  if (stock <= threshold) return 'low';
  return 'good';
}

/** Quick "amount received" suggestions: exact, then round-ups. */
export function suggestTenders(total: number): number[] {
  const out = new Set<number>([round2(total)]);
  for (const step of [10, 50, 100, 500, 1000]) {
    const v = Math.ceil(total / step) * step;
    if (v > total) out.add(v);
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}
