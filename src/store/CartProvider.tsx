'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { computeTotals, parseNumber, type Totals } from '@/lib/calc';
import type { DiscountType, PaymentMethod, Product } from '@/types';
import { useToast } from '@/components/ui/Toast';
import { useStore } from './StoreProvider';

export interface CartLine {
  product: Product;
  qty: number;
  lineTotal: number;
  /** Set when qty exceeds what is on hand (e.g. stock changed in another tab). */
  overStock: boolean;
}

interface CartValue {
  lines: CartLine[];
  itemCount: number;
  totals: Totals;
  hasIssues: boolean;
  discountType: DiscountType;
  discountInput: string;
  discountError?: string;
  method: PaymentMethod;
  setDiscountType(t: DiscountType): void;
  setDiscountInput(v: string): void;
  setMethod(m: PaymentMethod): void;
  add(product: Product): boolean;
  setQty(productId: string, qty: number): void;
  remove(productId: string): void;
  clear(): void;
}

const Ctx = createContext<CartValue | null>(null);

export function useCart(): CartValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCart must be used inside <CartProvider>');
  return v;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { products, settings } = useStore();
  const { notify } = useToast();
  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [discountType, setDiscountType] = useState<DiscountType>('fixed');
  const [discountInput, setDiscountInput] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Cash');

  const lines = useMemo<CartLine[]>(() => {
    const out: CartLine[] = [];
    for (const [id, qty] of Object.entries(qtyById)) {
      const product = products.find((p) => p.id === id);
      if (!product || qty < 1) continue; // deleted products silently drop out
      out.push({ product, qty, lineTotal: Math.round(product.price * qty * 100) / 100, overStock: qty > product.stock });
    }
    return out;
  }, [qtyById, products]);

  const discountValue = discountInput.trim() === '' ? 0 : parseNumber(discountInput);
  const discountError =
    discountInput.trim() === ''
      ? undefined
      : !Number.isFinite(discountValue) || discountValue < 0
        ? 'Enter 0 or more.'
        : discountType === 'percent' && discountValue > 100
          ? 'Percent cannot exceed 100.'
          : undefined;

  const totals = useMemo(
    () =>
      computeTotals(
        lines.map((l) => ({ price: l.product.price, qty: l.qty })),
        { type: discountType, value: discountError ? 0 : discountValue },
        { enabled: settings.taxEnabled, rate: settings.taxRate, inclusive: settings.taxInclusive },
      ),
    [lines, discountType, discountValue, discountError, settings.taxEnabled, settings.taxRate, settings.taxInclusive],
  );

  const add = useCallback(
    (product: Product): boolean => {
      const current = qtyById[product.id] ?? 0;
      if (product.stock < 1) {
        notify(`${product.name} is out of stock.`, { tone: 'warning' });
        return false;
      }
      if (current >= product.stock) {
        notify(`Only ${product.stock} of ${product.name} in stock.`, { tone: 'warning' });
        return false;
      }
      setQtyById((q) => ({ ...q, [product.id]: (q[product.id] ?? 0) + 1 }));
      return true;
    },
    [qtyById, notify],
  );

  const setQty = useCallback(
    (id: string, qty: number) => {
      const p = products.find((x) => x.id === id);
      if (p && qty > p.stock) {
        notify(`Only ${p.stock} of ${p.name} in stock.`, { tone: 'warning' });
        return;
      }
      setQtyById((q) => {
        const next = { ...q };
        if (qty < 1) delete next[id];
        else next[id] = qty;
        return next;
      });
    },
    [products, notify],
  );

  const remove = useCallback((id: string) => setQtyById((q) => Object.fromEntries(Object.entries(q).filter(([k]) => k !== id))), []);
  const clear = useCallback(() => {
    setQtyById({});
    setDiscountInput('');
    setDiscountType('fixed');
  }, []);

  const value = useMemo<CartValue>(
    () => ({
      lines,
      itemCount: totals.itemCount,
      totals,
      hasIssues: lines.some((l) => l.overStock) || !!discountError,
      discountType,
      discountInput,
      discountError,
      method,
      setDiscountType,
      setDiscountInput,
      setMethod,
      add,
      setQty,
      remove,
      clear,
    }),
    [lines, totals, discountType, discountInput, discountError, method, add, setQty, remove, clear],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
