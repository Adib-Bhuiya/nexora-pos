import { DEFAULT_SETTINGS } from '@/config/constants';
import { uid } from '@/lib/id';
import type { Product, Sale, StockMovement } from '@/types';
import { transaction } from './idb';

export interface DemoData {
  products: Product[];
  sales: Sale[];
  movements: StockMovement[];
  nextReceiptSeq: number;
}

/** Returns a clean, empty store template. */
export function buildDemoData(): DemoData {
  return { products: [], sales: [], movements: [], nextReceiptSeq: 1 };
}

/** Clear all products, sales, and movements to start fresh with an empty store. */
export async function seedDemo(opts: { resetSettings?: boolean } = {}): Promise<void> {
  await clearAllData();
  if (opts.resetSettings) {
    await transaction(['settings'], 'readwrite', async (s) => {
      await s.settings.put({ key: 'app', value: DEFAULT_SETTINGS });
    });
  }
}

/** Empty store: no products, sales, movements or queue. Settings are kept. */
export async function clearAllData(): Promise<void> {
  await transaction(['products', 'sales', 'movements', 'syncQueue', 'meta'], 'readwrite', async (s) => {
    await Promise.all([s.products.clear(), s.sales.clear(), s.movements.clear(), s.syncQueue.clear()]);
    await s.meta.put({ key: 'receiptSeq', value: 1 });
    await s.meta.put({ key: 'mvSeq', value: 0 });
    await s.meta.put({ key: 'seeded', value: true });
    await s.meta.put({ key: 'clean_v1', value: true });
  });
}

/** Initialize an empty database on first launch and ensure any legacy sample data is cleared. */
export async function ensureInitialized(): Promise<void> {
  await transaction(['products', 'sales', 'movements', 'settings', 'syncQueue', 'meta'], 'readwrite', async (s) => {
    if (!(await s.meta.get('deviceId'))) await s.meta.put({ key: 'deviceId', value: uid('device') });
    if (!(await s.meta.get('receiptSeq'))) await s.meta.put({ key: 'receiptSeq', value: 1 });
    if (!(await s.meta.get('mvSeq'))) await s.meta.put({ key: 'mvSeq', value: 0 });
    if (!(await s.settings.get('app'))) await s.settings.put({ key: 'app', value: DEFAULT_SETTINGS });

    // Mark initialized without deleting existing user data
    const cleaned = await s.meta.get('clean_v1');
    if (!cleaned) {
      await s.meta.put({ key: 'clean_v1', value: true });
    }
    await s.meta.put({ key: 'seeded', value: true });
  });
}
