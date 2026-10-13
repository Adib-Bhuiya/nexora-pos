import type { Product, Settings } from '@/types';
import { parseNumber } from './calc';

export type Errors<K extends string> = Partial<Record<K, string>>;

export interface ProductDraft {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  price: string;
  cost: string;
  stock: string;
}

export interface ParsedProduct {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
}

export function validateProductDraft(
  d: ProductDraft,
  existing: Product[],
  editingId?: string,
): { errors: Errors<keyof ProductDraft>; value?: ParsedProduct } {
  const errors: Errors<keyof ProductDraft> = {};
  const others = existing.filter((p) => p.id !== editingId);
  const name = d.name.trim();
  const sku = d.sku.trim();
  const barcode = d.barcode.trim();

  if (!name) errors.name = 'Enter a product name.';
  else if (name.length > 80) errors.name = 'Keep the name under 80 characters.';

  if (!sku) errors.sku = 'Enter a SKU.';
  else if (sku.length > 40) errors.sku = 'Keep the SKU under 40 characters.';
  else if (others.some((p) => p.sku.toLowerCase() === sku.toLowerCase())) errors.sku = 'This SKU is already used.';

  if (barcode) {
    if (!/^[A-Za-z0-9\-_.]{3,32}$/.test(barcode)) errors.barcode = 'Use 3–32 letters, numbers, or - _ .';
    else if (others.some((p) => p.barcode && p.barcode.toLowerCase() === barcode.toLowerCase()))
      errors.barcode = 'This barcode is already used.';
  }

  if (!d.category) errors.category = 'Choose a category.';

  const price = parseNumber(d.price);
  if (!Number.isFinite(price)) errors.price = 'Enter a selling price.';
  else if (price < 0) errors.price = 'Price cannot be negative.';

  const cost = parseNumber(d.cost);
  if (!Number.isFinite(cost)) errors.cost = 'Enter a unit cost (0 if unknown).';
  else if (cost < 0) errors.cost = 'Cost cannot be negative.';

  const stock = parseNumber(d.stock);
  if (!Number.isFinite(stock)) errors.stock = 'Enter a stock quantity.';
  else if (!Number.isInteger(stock) || stock < 0) errors.stock = 'Use a whole number, 0 or more.';

  if (Object.keys(errors).length) return { errors };
  return { errors, value: { name, sku, barcode, category: d.category, price, cost, stock } };
}

export type SettingsDraft = Omit<Settings, 'taxRate' | 'lowStockThreshold'> & {
  taxRate: string;
  lowStockThreshold: string;
};

export function validateSettingsDraft(
  d: SettingsDraft,
): { errors: Errors<keyof SettingsDraft>; value?: Settings } {
  const errors: Errors<keyof SettingsDraft> = {};
  if (!d.storeName.trim()) errors.storeName = 'Store name cannot be empty.';
  if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) errors.email = 'Enter a valid email address.';
  const rate = parseNumber(d.taxRate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) errors.taxRate = 'Enter a rate between 0 and 100.';
  const threshold = parseNumber(d.lowStockThreshold);
  if (!Number.isInteger(threshold) || threshold < 0) errors.lowStockThreshold = 'Use a whole number, 0 or more.';
  if (!d.receiptPrefix.trim() || !/^[A-Za-z0-9]{1,6}$/.test(d.receiptPrefix.trim()))
    errors.receiptPrefix = 'Use 1–6 letters or numbers.';
  if (!d.taxLabel.trim()) errors.taxLabel = 'Enter a tax label, e.g. VAT.';
  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    value: {
      ...d,
      storeName: d.storeName.trim(),
      address: d.address.trim(),
      phone: d.phone.trim(),
      email: d.email.trim(),
      taxId: d.taxId.trim(),
      taxLabel: d.taxLabel.trim(),
      receiptPrefix: d.receiptPrefix.trim().toUpperCase(),
      taxRate: rate,
      lowStockThreshold: threshold,
    },
  };
}

/** Thrown by commands for expected, user-fixable problems. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
