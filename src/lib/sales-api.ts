import type { Sale } from '@/types';

interface SalesResponse {
  success: boolean;
  sales?: Sale[];
  message?: string;
}

interface SaleResponse {
  success: boolean;
  sale?: Sale;
  message?: string;
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & {
    success?: boolean;
    message?: string;
  };

  if (!response.ok || data.success === false) {
    throw new Error(data.message || 'Sales request failed.');
  }

  return data;
}

export async function fetchSales(): Promise<Sale[]> {
  const response = await fetch('/api/sales', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  });

  const data = await readResponse<SalesResponse>(response);

  return data.sales ?? [];
}

export interface RecordSaleApiInput {
  receipt?: string;
  items: Array<{
    productId: string;
    name: string;
    sku: string;
    qty: number;
    price: number;
    cost: number;
  }>;
  subtotal: number;
  discountType: 'fixed' | 'percent';
  discountValue: number;
  discount: number;
  taxLabel?: string;
  taxRate?: number;
  taxInclusive?: boolean;
  tax: number;
  total: number;
  tendered?: number;
  change?: number;
  method: 'Cash' | 'Mobile financial service' | 'Card';
  cashierId?: string;
  cashierName?: string;
  time?: string;
}

export async function recordSaleApi(input: RecordSaleApiInput): Promise<Sale> {
  const response = await fetch('/api/sales', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'NexoraPOS',
    },
    body: JSON.stringify(input),
  });

  const data = await readResponse<SaleResponse>(response);

  if (!data.sale) {
    throw new Error('The server did not return the completed sale.');
  }

  return data.sale;
}

export async function refundSaleApi(
  saleId: string,
  reason: string,
  items?: { productId: string; qty: number }[]
): Promise<{ sale: Sale; message: string }> {
  const response = await fetch(`/api/sales/${encodeURIComponent(saleId)}/refund`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'NexoraPOS',
    },
    body: JSON.stringify({ reason, items }),
  });

  const data = await readResponse<{ success: boolean; sale?: Sale; message?: string }>(response);
  if (!data.sale) {
    throw new Error(data.message || 'Refund request failed.');
  }

  return { sale: data.sale, message: data.message || 'Refund processed successfully.' };
}

