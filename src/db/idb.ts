import type { Product, Sale, Settings, StockMovement, SyncOperation } from '@/types';

/**
 * Minimal promise wrapper around IndexedDB (no dependency).
 * Everything the app persists lives here: products, sales, stock movements,
 * settings, the pending-sync queue and a little metadata.
 */
const DB_NAME = 'nexora-pos';
const DB_VERSION = 1;

export type StoreName = 'products' | 'sales' | 'movements' | 'settings' | 'syncQueue' | 'meta';

export interface TxStore<T> {
  get(key: IDBValidKey): Promise<T | undefined>;
  getAll(): Promise<T[]>;
  put(value: T): Promise<void>;
  delete(key: IDBValidKey): Promise<void>;
  clear(): Promise<void>;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}
export interface SettingsRecord {
  key: 'app';
  value: Settings;
}

export interface TxStores {
  products: TxStore<Product>;
  sales: TxStore<Sale>;
  movements: TxStore<StockMovement>;
  settings: TxStore<SettingsRecord>;
  syncQueue: TxStore<SyncOperation>;
  meta: TxStore<MetaRecord>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      dbPromise = null;
      reject(new Error('IndexedDB is not available in this browser or browsing mode.'));
      return;
    }

    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      dbPromise = null;
      reject(e instanceof Error ? e : new Error('Failed to open local database.'));
      return;
    }

    const timer = setTimeout(() => {
      if (dbPromise) {
        dbPromise = null;
        reject(new Error('Connecting to local database timed out.'));
      }
    }, 8000);

    req.onupgradeneeded = () => {
      // Schema v1. Future versions: branch on event.oldVersion and migrate in place.
      const db = req.result;
      db.createObjectStore('products', { keyPath: 'id' });
      db.createObjectStore('sales', { keyPath: 'id' }).createIndex('time', 'time');
      const mv = db.createObjectStore('movements', { keyPath: 'id' });
      mv.createIndex('productId', 'productId');
      mv.createIndex('time', 'time');
      db.createObjectStore('settings', { keyPath: 'key' });
      const q = db.createObjectStore('syncQueue', { keyPath: 'id' });
      q.createIndex('status', 'status');
      q.createIndex('createdAt', 'createdAt');
      db.createObjectStore('meta', { keyPath: 'key' });
    };

    req.onblocked = () => {
      console.warn('IndexedDB database open was blocked.');
      setTimeout(() => {
        if (dbPromise) {
          clearTimeout(timer);
          dbPromise = null;
          reject(new Error('Database open blocked by another tab or connection.'));
        }
      }, 3000);
    };

    req.onsuccess = () => {
      clearTimeout(timer);
      const db = req.result;
      // Another tab is upgrading the schema: release our connection.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    req.onerror = () => {
      clearTimeout(timer);
      dbPromise = null;
      reject(req.error ?? new Error('Could not open the local database.'));
    };
  });
  return dbPromise;
}

/** Close the connection (used by tests). */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise.catch(() => null);
  db?.close();
  dbPromise = null;
}

const request = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

function wrap<T>(store: IDBObjectStore): TxStore<T> {
  return {
    get: (key) => request(store.get(key)) as Promise<T | undefined>,
    getAll: () => request(store.getAll()) as Promise<T[]>,
    put: async (value) => {
      await request(store.put(value));
    },
    delete: async (key) => {
      await request(store.delete(key));
    },
    clear: async () => {
      await request(store.clear());
    },
  };
}

/**
 * Run `work` inside ONE IndexedDB transaction. If `work` throws, the whole
 * transaction is rolled back, so multi-store updates (e.g. a sale + its stock
 * changes + its sync entries) are atomic.
 *
 * Only await IndexedDB calls inside `work`: awaiting anything else (fetch,
 * timers) lets the browser auto-commit the transaction early.
 */
export async function transaction<T>(
  names: StoreName[],
  mode: IDBTransactionMode,
  work: (stores: TxStores) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    let failed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
    };

    timer = setTimeout(() => {
      if (!failed) {
        failed = true;
        try {
          tx.abort();
        } catch {
          /* already finished */
        }
        reject(new Error('Database transaction timed out.'));
      }
    }, 15000);

    const tx = db.transaction(names, mode);
    const stores = {} as Record<string, TxStore<unknown>>;
    for (const n of names) stores[n] = wrap(tx.objectStore(n));
    let result: T;

    tx.oncomplete = () => {
      cleanup();
      resolve(result);
    };
    tx.onerror = () => {
      cleanup();
      failed = true;
      reject(tx.error ?? new Error('Database transaction failed.'));
    };
    tx.onabort = () => {
      cleanup();
      failed = true;
      reject(tx.error ?? new Error('Database transaction was cancelled.'));
    };
    work(stores as unknown as TxStores).then(
      (r) => {
        result = r;
      },
      (err) => {
        if (!failed) {
          cleanup();
          failed = true;
          try {
            tx.abort();
          } catch {
            /* already finished */
          }
          reject(err);
        }
      },
    );
  });
}
