import { describe, expect, it } from 'vitest';
import { changeDue, computeTotals, parseNumber, round2, stockStatus, suggestTenders } from './calc';

const noTax = { enabled: false, rate: 0, inclusive: false };
const lines = [
  { price: 85, qty: 2 },
  { price: 25, qty: 3 },
];

describe('computeTotals', () => {
  it('sums lines and counts items', () => {
    const t = computeTotals(lines, { type: 'fixed', value: 0 }, noTax);
    expect(t).toMatchObject({ itemCount: 5, subtotal: 245, discount: 0, tax: 0, total: 245 });
  });
  it('applies a fixed discount and clamps it to the subtotal', () => {
    expect(computeTotals(lines, { type: 'fixed', value: 45 }, noTax).total).toBe(200);
    expect(computeTotals(lines, { type: 'fixed', value: 9999 }, noTax)).toMatchObject({ discount: 245, total: 0 });
  });
  it('applies a percent discount and clamps to 100%', () => {
    expect(computeTotals(lines, { type: 'percent', value: 10 }, noTax)).toMatchObject({ discount: 24.5, total: 220.5 });
    expect(computeTotals(lines, { type: 'percent', value: 500 }, noTax).total).toBe(0);
  });
  it('ignores negative and NaN discounts', () => {
    expect(computeTotals(lines, { type: 'fixed', value: -50 }, noTax).total).toBe(245);
    expect(computeTotals(lines, { type: 'fixed', value: NaN }, noTax).total).toBe(245);
  });
  it('adds exclusive tax after the discount', () => {
    const t = computeTotals(lines, { type: 'fixed', value: 45 }, { enabled: true, rate: 5, inclusive: false });
    expect(t).toMatchObject({ taxable: 200, tax: 10, total: 210 });
  });
  it('extracts inclusive tax without changing the total', () => {
    const t = computeTotals([{ price: 105, qty: 1 }], { type: 'fixed', value: 0 }, { enabled: true, rate: 5, inclusive: true });
    expect(t).toMatchObject({ tax: 5, total: 105 });
  });
  it('ignores tax config when disabled', () => {
    expect(computeTotals(lines, { type: 'fixed', value: 0 }, { enabled: false, rate: 15, inclusive: false }).tax).toBe(0);
  });
  it('rounds to 2 decimals without float drift', () => {
    expect(computeTotals([{ price: 0.1, qty: 3 }], { type: 'fixed', value: 0 }, noTax).subtotal).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });
});

describe('helpers', () => {
  it('parseNumber returns NaN for empty text', () => {
    expect(parseNumber('')).toBeNaN();
    expect(parseNumber(' 12.5 ')).toBe(12.5);
    expect(parseNumber('abc')).toBeNaN();
  });
  it('changeDue never goes negative', () => {
    expect(changeDue(500, 245)).toBe(255);
    expect(changeDue(100, 245)).toBe(0);
  });
  it('stockStatus uses the threshold inclusively', () => {
    expect(stockStatus(0, 5)).toBe('out');
    expect(stockStatus(5, 5)).toBe('low');
    expect(stockStatus(6, 5)).toBe('good');
  });
  it('suggestTenders includes exact and round-ups', () => {
    const s = suggestTenders(245);
    expect(s[0]).toBe(245);
    expect(s).toContain(250);
    expect(s.length).toBeLessThanOrEqual(4);
  });
});
