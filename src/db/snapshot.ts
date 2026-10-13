import { DEFAULT_SETTINGS, MOCK_USERS } from '@/config/constants';
import type { Product, Sale, Settings, StockMovement, SyncOperation } from '@/types';
import { transaction } from './idb';

export interface Snapshot {
  products: Product[];
  sales: Sale[];
  movements: StockMovement[];
  queue: SyncOperation[];
  settings: Settings;
  sessionUserId: string;
  deviceId: string;
}

export async function loadSnapshot(): Promise<Snapshot> {
  return transaction(['products', 'sales', 'movements', 'settings', 'syncQueue', 'meta'], 'readonly', async (s) => {
    const [products, sales, movements, queue, settingsRec, session, device] = await Promise.all([
      s.products.getAll(),
      s.sales.getAll(),
      s.movements.getAll(),
      s.syncQueue.getAll(),
      s.settings.get('app'),
      s.meta.get('sessionUserId'),
      s.meta.get('deviceId'),
    ]);
    const settings: Settings = { ...DEFAULT_SETTINGS, ...settingsRec?.value };
    if (!Array.isArray(settings.categories) || settings.categories.length === 0)
      settings.categories = DEFAULT_SETTINGS.categories;
    return {
      products: products.sort((a, b) => a.name.localeCompare(b.name)),
      sales: sales.sort((a, b) => b.time.localeCompare(a.time) || b.receipt.localeCompare(a.receipt)),
      movements: movements.sort((a, b) => b.seq - a.seq),
      queue: queue.sort((a, b) => a.seq - b.seq),
      settings,
      sessionUserId: typeof session?.value === 'string' ? session.value : MOCK_USERS[0].id,
      deviceId: typeof device?.value === 'string' ? device.value : '',
    };
  });
}

/** Full JSON backup of everything stored in this browser. */
export async function exportAll(): Promise<string> {
  const snap = await loadSnapshot();
  return JSON.stringify(
    {
      app: 'nexora-pos',
      exportedAt: new Date().toISOString(),
      note: 'Local backup. Contains all products, sales, stock movements, settings and the pending-sync queue.',
      products: snap.products,
      sales: snap.sales,
      movements: snap.movements,
      syncQueue: snap.queue,
      settings: snap.settings,
    },
    null,
    2,
  );
}
