import { transaction } from '@/db/idb';
import type { SyncOperation } from '@/types';

/**
 * ─── Backend seam ────────────────────────────────────────────────────────────
 * The app never talks to a server. Every local change is written to a queue of
 * `SyncOperation`s, and `runSync` hands them to a `SyncTransport`.
 *
 * Today the transport is `createSimulatedTransport()`, which only pretends to
 * succeed. Nothing leaves this browser and no other device can see the data.
 *
 * To add a backend later, implement `SyncTransport.push` with a real HTTP call
 * (use `op.id` as an idempotency key; return one result per op) and swap the
 * transport in `StoreProvider`. No page or component needs to change.
 */
export interface SyncResult {
  id: string;
  ok: boolean;
  error?: string;
}

export interface SyncTransport {
  readonly name: string;
  push(ops: SyncOperation[]): Promise<SyncResult[]>;
}

export function createSimulatedTransport(
  opts: { delayMs?: number; shouldFail?: () => boolean } = {},
): SyncTransport {
  const delay = opts.delayMs ?? 700;
  return {
    name: 'Simulated (no server)',
    async push(ops) {
      await new Promise((r) => setTimeout(r, delay));
      const fail = opts.shouldFail?.() ?? false;
      return ops.map((o) => ({
        id: o.id,
        ok: !fail,
        error: fail ? 'Simulated server error (demo)' : undefined,
      }));
    },
  };
}

/** How many already-synced operations to keep for the "history" view. */
const HISTORY_LIMIT = 50;

export interface SyncSummary {
  synced: number;
  failed: number;
}

export async function runSync(
  transport: SyncTransport,
  include: ('pending' | 'failed')[] = ['pending', 'failed'],
): Promise<SyncSummary> {
  const all = await transaction(['syncQueue'], 'readonly', (s) => s.syncQueue.getAll());
  const todo = all.filter((o) => (include as string[]).includes(o.status)).sort((a, b) => a.seq - b.seq);
  if (todo.length === 0) return { synced: 0, failed: 0 };

  let results: SyncResult[];
  try {
    results = await transport.push(todo);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed.';
    results = todo.map((o) => ({ id: o.id, ok: false, error: message }));
  }
  const byId = new Map(results.map((r) => [r.id, r]));

  return transaction(['syncQueue', 'sales'], 'readwrite', async (s) => {
    let synced = 0;
    let failed = 0;
    const at = new Date().toISOString();
    for (const op of todo) {
      const r = byId.get(op.id);
      if (r?.ok) {
        synced++;
        await s.syncQueue.put({ ...op, status: 'synced', syncedAt: at, attempts: op.attempts + 1, lastError: undefined });
        if (op.entity === 'sale' && op.action === 'create') {
          const sale = await s.sales.get(op.entityId);
          if (sale) await s.sales.put({ ...sale, syncStatus: 'synced' });
        }
      } else {
        failed++;
        await s.syncQueue.put({ ...op, status: 'failed', attempts: op.attempts + 1, lastError: r?.error ?? 'No response' });
      }
    }
    // Keep only the most recent synced operations as history.
    const current = await s.syncQueue.getAll();
    const history = current.filter((o) => o.status === 'synced').sort((a, b) => (b.syncedAt ?? '').localeCompare(a.syncedAt ?? ''));
    for (const old of history.slice(HISTORY_LIMIT)) await s.syncQueue.delete(old.id);
    return { synced, failed };
  });
}

export async function clearSyncHistory(): Promise<void> {
  await transaction(['syncQueue'], 'readwrite', async (s) => {
    for (const o of await s.syncQueue.getAll()) if (o.status === 'synced') await s.syncQueue.delete(o.id);
  });
}
