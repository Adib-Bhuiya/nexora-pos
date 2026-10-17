
import type { Product, ProductInput } from '@/types';

interface ProductsResponse {
  success: boolean;
  products?: Product[];
  message?: string;
}

interface ProductResponse {
  success: boolean;
  product?: Product;
  message?: string;
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & {
    success?: boolean;
    message?: string;
  };

  if (!response.ok || data.success === false) {
    throw new Error(data.message || 'Product request failed.');
  }

  return data;
}

export async function fetchProducts(): Promise<Product[]> {
  const response = await fetch('/api/products', {
    method: 'GET',
    cache: 'no-store',
  });

  const data = await readResponse<ProductsResponse>(response);

  return data.products ?? [];
}

export async function createProductApi(
  input: ProductInput,
): Promise<Product> {
  const response = await fetch('/api/products', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'NexoraPOS',
    },
    body: JSON.stringify(input),
  });

  const data = await readResponse<ProductResponse>(response);

  if (!data.product) {
    throw new Error('The server did not return the created product.');
  }

  return data.product;
}

export async function updateProductApi(
  id: string,
  input: ProductInput,
): Promise<Product> {
  const response = await fetch(
    `/api/products/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'NexoraPOS',
      },
      body: JSON.stringify(input),
    },
  );

  const data = await readResponse<ProductResponse>(response);

  if (!data.product) {
    throw new Error('The server did not return the updated product.');
  }

  return data.product;
}

export async function deleteProductApi(id: string): Promise<void> {
  const response = await fetch(
    `/api/products/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'NexoraPOS',
      },
    },
  );

  await readResponse<ProductResponse>(response);
}

export interface StockChange {
  productId: string;
  quantity: number;
}

export async function updateStockApi(
  changes: StockChange[]
): Promise<Product[]> {
  const response = await fetch('/api/products/stock', {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'NexoraPOS',
    },
    body: JSON.stringify({ changes }),
  });

  const data = await readResponse<{
    success: boolean;
    products?: Product[];
    message?: string;
  }>(response);

  return data.products ?? [];
}
