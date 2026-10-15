import type { Product, Sale, Settings, StockMovement } from '@/types';
import { transaction } from './idb';

/**
 * Cache products received from MongoDB in IndexedDB.
 */
export async function cacheMongoProducts(
  mongoProducts: Product[],
): Promise<void> {
  await transaction(['products'], 'readwrite', async (stores) => {
    await stores.products.clear();
    for (const product of mongoProducts) {
      if (
        !product.id ||
        !product.name ||
        !product.sku ||
        !Number.isFinite(product.price) ||
        !Number.isFinite(product.cost) ||
        !Number.isInteger(product.stock)
      ) {
        throw new Error(
          `Invalid product data received from MongoDB: ${product.name || 'unknown product'}`,
        );
      }

      await stores.products.put({
        ...product,
        barcode: product.barcode ?? '',
        imageUrl: product.imageUrl ?? '',
        tone: product.tone ?? 'blue',
      });
    }
  });
}

/**
 * Cache sales received from MongoDB in IndexedDB.
 */
export async function cacheMongoSales(
  mongoSales: Sale[],
): Promise<void> {
  await transaction(['sales'], 'readwrite', async (stores) => {
    await stores.sales.clear();
    for (const sale of mongoSales) {
      if (!sale.id || !sale.receipt || !Array.isArray(sale.items)) {
        continue;
      }
      await stores.sales.put({
        ...sale,
        syncStatus: 'synced',
      });
    }
  });
}

/**
 * Cache stock movements received from MongoDB in IndexedDB.
 */
export async function cacheMongoMovements(
  mongoMovements: StockMovement[],
): Promise<void> {
  await transaction(['movements'], 'readwrite', async (stores) => {
    await stores.movements.clear();
    for (const movement of mongoMovements) {
      if (!movement.id || !movement.productId || typeof movement.change !== 'number') {
        continue;
      }
      await stores.movements.put(movement);
    }
  });
}

/**
 * Cache application settings received from MongoDB in IndexedDB.
 */
export async function cacheMongoSettings(
  mongoSettings: Settings,
): Promise<void> {
  await transaction(['settings'], 'readwrite', async (stores) => {
    await stores.settings.put({ key: 'app', value: mongoSettings });
  });
}