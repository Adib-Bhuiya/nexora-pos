import { describe, expect, it } from 'vitest';
import type { Sale } from '@/types';
import { bestSellers, inventoryReport, paymentBreakdown, saleProfit, salesByDay, salesByMonth, sumRows } from './analytics';

const mk = (over: Partial<Sale> & { time: string }): Sale => ({
  id: 'T',
  receipt: 'NX-1',
  cashierId: 'u',
  cashierName: 'U',
  method: 'Cash',
  items: [{ productId: 'a', name: 'A', sku: 'A', qty: 2, price: 50, cost: 30 }],
  subtotal: 100,
  discountType: 'fixed',
  discountValue: 0,
  discount: 0,
  taxLabel: '',
  taxRate: 0,
  taxInclusive: false,
  tax: 0,
  total: 100,
  syncStatus: 'synced',
  ...over,
});

const now = new Date(2026, 9, 12, 15, 0);

describe('analytics', () => {
  it('buckets by day including empty days, oldest first', () => {
    const rows = salesByDay([mk({ time: new Date(2026, 9, 12, 9).toISOString() }), mk({ time: new Date(2026, 9, 10, 9).toISOString() })], 3, now);
    expect(rows.map((r) => r.revenue)).toEqual([100, 0, 100]);
    expect(rows[2].orders).toBe(1);
  });
  it('ignores sales outside the window', () => {
    const rows = salesByDay([mk({ time: new Date(2026, 8, 1).toISOString() })], 7, now);
    expect(sumRows(rows).orders).toBe(0);
  });
  it('buckets by month', () => {
    const rows = salesByMonth([mk({ time: new Date(2026, 8, 20).toISOString() }), mk({ time: new Date(2026, 9, 1).toISOString() })], 3, now);
    expect(rows.map((r) => r.orders)).toEqual([0, 1, 1]);
  });
  it('profit excludes collected tax and subtracts cost of goods', () => {
    const s = mk({ time: now.toISOString(), tax: 5, total: 105 });
    expect(saleProfit(s)).toBe(100 - 60);
  });
  it('ranks best sellers by units', () => {
    const sales = [
      mk({ time: now.toISOString() }),
      mk({ time: now.toISOString(), items: [{ productId: 'b', name: 'B', sku: 'B', qty: 5, price: 10, cost: 4 }] }),
    ];
    const top = bestSellers(sales, 5);
    expect(top[0]).toMatchObject({ productId: 'b', units: 5, revenue: 50, profit: 30 });
  });
  it('payment shares add up to 1 when there are sales', () => {
    const shares = paymentBreakdown(
      [mk({ time: now.toISOString() }), mk({ time: now.toISOString(), method: 'Card', total: 300 })],
      ['Cash', 'Mobile financial service', 'Card'],
    );
    expect(shares.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1);
    expect(shares[1].total).toBe(0);
  });
  it('inventory report values stock and flags low/out', () => {
    const p = (stock: number, id: string) => ({ id, name: id, sku: id, barcode: '', category: 'x', price: 10, cost: 6, stock, emoji: '', tone: '', createdAt: '', updatedAt: '' });
    const r = inventoryReport([p(0, 'a'), p(3, 'b'), p(20, 'c')], 5);
    expect(r).toMatchObject({ units: 23, costValue: 138, retailValue: 230, potentialProfit: 92 });
    expect(r.out).toHaveLength(1);
    expect(r.low).toHaveLength(1);
  });
});
