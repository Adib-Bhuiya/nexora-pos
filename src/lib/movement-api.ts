import type { Product, StockMovement } from '@/types';

interface MovementsResponse {
  success: boolean;
  movements?: StockMovement[];
  message?: string;
}

interface AdjustResponse {
  success: boolean;
  movement?: StockMovement;
  product?: Product;
  message?: string;
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & {
    success?: boolean;
    message?: string;
  };

  if (!response.ok || data.success === false) {
    throw new Error(data.message || 'Inventory movement request failed.');
  }

  return data;
}

export async function fetchMovements(): Promise<StockMovement[]> {
  const response = await fetch('/api/movements', {
    method: 'GET',
    cache: 'no-store',
  });

  const data = await readResponse<MovementsResponse>(response);

  return data.movements ?? [];
}

export async function adjustStockApi(
  productId: string,
  kind: 'restock' | 'set',
  quantity: number,
  note: string,
  actorName: string,
): Promise<{ movement: StockMovement; product: Product }> {
  const response = await fetch('/api/movements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId,
      kind,
      quantity,
      note,
      actorName,
    }),
  });

  const data = await readResponse<AdjustResponse>(response);

  if (!data.movement || !data.product) {
    throw new Error('The server did not return the stock movement or updated product.');
  }

  return { movement: data.movement, product: data.product };
}

