import type { Product } from '@/types';
import { transaction } from './idb';

/**
 * Cache products received from MongoDB in IndexedDB.
 *
 * This function only updates the products store. It does not clear or
 * modify sales, stock movements, settings, or the sync queue.
 */
export async function cacheMongoProducts(
  mongoProducts: Product[],
): Promise<void> {
  await transaction(['products'], 'readwrite', async (stores) => {
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