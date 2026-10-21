'use client';
import {
  cacheMongoProducts,
  cacheMongoSales,
  cacheMongoMovements,
  cacheMongoSettings,
} from '@/db/product-cache';
import {
  fetchProducts,
  createProductApi,
  updateProductApi,
  deleteProductApi,
} from '@/lib/product-api';
import { fetchSales, recordSaleApi, refundSaleApi } from '@/lib/sales-api';
import { fetchMovements, adjustStockApi } from '@/lib/movement-api';
import { fetchSettings, saveSettingsApi } from '@/lib/settings-api';
import { clearDatabaseApi } from '@/lib/database-api';
import {
  fetchAuthStatus,
  loginOwnerApi,
  loginPinApi,
  logoutApi,
  fetchUsersApi,
  createCashierApi,
  updateUserApi,
  deleteUserApi,
  resetCashierPinApi,
  type UpdateUserInput,
} from '@/lib/auth-api';
import { computeTotals, changeDue } from '@/lib/calc';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { can as canDo, type Permission } from '@/config/permissions';
import * as commands from '@/db/commands';
import { loadSnapshot, type Snapshot } from '@/db/snapshot';
import { clearAllData, ensureInitialized, seedDemo } from '@/db/seed';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { ValidationError } from '@/lib/validation';
import { clearSyncHistory, createSimulatedTransport, runSync, type SyncSummary } from '@/services/sync';
import type { Product, ProductInput, Sale, Settings, StockMovement, SyncOperation, User } from '@/types';
import { useToast } from '@/components/ui/Toast';
import { BootError, Splash } from '@/components/layout/Splash';
import { InitialSetupModal } from '@/components/auth/InitialSetupModal';
import { AuthScreen } from '@/components/auth/AuthScreen';

interface StoreActions {
  createProduct(input: ProductInput): Promise<Product>;
  updateProduct(id: string, input: ProductInput): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  restock(productId: string, quantity: number, note: string): Promise<StockMovement>;
  setStock(productId: string, counted: number, note: string): Promise<StockMovement>;
  recordSale(input: commands.SaleInput): Promise<Sale>;
  refundSale(saleId: string, reason: string, items?: { productId: string; qty: number }[]): Promise<Sale>;
  saveSettings(settings: Settings): Promise<void>;
  switchUser(id: string): Promise<void>;
  loginOwner(email: string, password: string): Promise<User>;
  loginPin(userId: string, pin: string): Promise<User>;
  logout(): Promise<void>;
  createCashier(name: string, pin: string): Promise<User>;
  updateUser(id: string, input: UpdateUserInput): Promise<User>;
  deleteUser(id: string): Promise<void>;
  resetCashierPin(id: string, pin: string, confirmPin?: string): Promise<User>;
  refreshAuth(): Promise<void>;
  resetDemo(): Promise<void>;
  clearAll(): Promise<void>;
}

interface StoreValue {
  products: Product[];
  sales: Sale[];
  movements: StockMovement[];
  queue: SyncOperation[];
  settings: Settings;
  deviceId: string;

  user: User;
  users: User[];
  initialized: boolean;
  authenticated: boolean;
  can(permission: Permission): boolean;

  /** Effective connectivity: real device network AND not simulating offline. */
  online: boolean;
  deviceOnline: boolean;
  simulatedOffline: boolean;
  setSimulatedOffline(v: boolean): void;
  simulateFailure: boolean;
  setSimulateFailure(v: boolean): void;

  syncing: boolean;
  pendingCount: number;
  failedCount: number;
  transportName: string;
  syncNow(): Promise<SyncSummary | null>;
  clearSyncedHistory(): Promise<void>;

  actions: StoreActions;
}

const Ctx = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used inside <StoreProvider>');
  return v;
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export function StoreProvider({ children }: { children: ReactNode }) {
  const { notify } = useToast();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [authLoading, setAuthLoading] = useState(true);
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [liveUser, setLiveUser] = useState<User | null>(null);
  const [staffUsers, setStaffUsers] = useState<User[]>([]);

  const deviceOnline = useOnlineStatus();
  const online = deviceOnline && !simulatedOffline;

  const failRef = useRef(false);
  failRef.current = simulateFailure;
  const syncingRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  // ↓ The backend seam. Replace with a real HTTP transport later (see services/sync.ts).
  const transport = useMemo(() => createSimulatedTransport({ shouldFail: () => failRef.current }), []);

  const refreshAuth = useCallback(async () => {
    try {
      const status = await fetchAuthStatus();
      setInitialized(status.initialized);
      setAuthenticated(status.authenticated);
      if (status.authenticated && status.user) {
        setLiveUser(status.user);
        if (status.user.role === 'owner') {
          try {
            const list = await fetchUsersApi();
            setStaffUsers(list);
          } catch {
            setStaffUsers([]);
          }
        } else {
          setStaffUsers([]);
        }
      } else {
        setLiveUser(null);
        setStaffUsers([]);
      }
      return status;
    } catch (err) {
      console.error('Could not refresh auth status:', err);
      setAuthenticated(false);
      setLiveUser(null);
      setStaffUsers([]);
      throw err;
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [productsRes, salesRes, movementsRes, settingsRes] =
        await Promise.allSettled([
          fetchProducts(),
          fetchSales(),
          fetchMovements(),
          fetchSettings(),
        ]);

      if (productsRes.status === 'fulfilled') {
        await cacheMongoProducts(productsRes.value);
      } else {
        console.error('Could not refresh products from MongoDB:', productsRes.reason);
      }

      if (salesRes.status === 'fulfilled') {
        await cacheMongoSales(salesRes.value);
      } else {
        console.error('Could not refresh sales from MongoDB:', salesRes.reason);
      }

      if (movementsRes.status === 'fulfilled') {
        await cacheMongoMovements(movementsRes.value);
      } else {
        console.error('Could not refresh movements from MongoDB:', movementsRes.reason);
      }

      if (settingsRes.status === 'fulfilled') {
        await cacheMongoSettings(settingsRes.value);
      } else {
        console.error('Could not refresh settings from MongoDB:', settingsRes.reason);
      }
    } catch (error) {
      console.error('Could not refresh data from MongoDB:', error);
    }

    setSnap(await loadSnapshot());
  }, []);

  /** Reload after a local write and tell other tabs to do the same. */
  const changed = useCallback(async () => {
    await refresh();
    channelRef.current?.postMessage('changed');
  }, [refresh]);

  const boot = useCallback(async () => {
    setBootError(null);
    setAuthLoading(true);
    let finished = false;
    const safetyTimer = setTimeout(() => {
      if (!finished) {
        setBootError('Opening local storage took too long. Click below to retry.');
      }
    }, 10000);
    try {
      await ensureInitialized();
      let authStatus: Awaited<ReturnType<typeof fetchAuthStatus>> | null = null;
      try {
        authStatus = await refreshAuth();
      } catch (err: any) {
        console.error('Auth check error during boot:', err);
        setBootError(err?.message || 'Failed to connect to authentication server. Click below to retry.');
        finished = true;
        clearTimeout(safetyTimer);
        return;
      }

      if (authStatus?.authenticated) {
        await refresh();
      } else {
        setSnap(await loadSnapshot());
      }
      finished = true;
      clearTimeout(safetyTimer);
      // Ask the browser not to evict our data under storage pressure.
      void navigator.storage?.persist?.().catch(() => undefined);
    } catch (e) {
      finished = true;
      clearTimeout(safetyTimer);
      setBootError(errorMessage(e));
    }
  }, [refresh, refreshAuth]);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Keep several open tabs of the app consistent.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      const ch = new BroadcastChannel('nexora-pos');
      channelRef.current = ch;
      ch.onmessage = () => void refresh().catch(() => undefined);
      return () => {
        try {
          ch.close();
        } catch { }
        channelRef.current = null;
      };
    } catch {
      // In restricted iframe contexts BroadcastChannel may throw SecurityError
    }
  }, [refresh]);

  const queue = snap?.queue;
  const pendingCount = useMemo(() => queue?.filter((o) => o.status === 'pending').length ?? 0, [queue]);
  const failedCount = useMemo(() => queue?.filter((o) => o.status === 'failed').length ?? 0, [queue]);

  const doSync = useCallback(
    async (include: ('pending' | 'failed')[], quiet: boolean): Promise<SyncSummary | null> => {
      if (syncingRef.current) return null;
      syncingRef.current = true;
      setSyncing(true);
      try {
        const r = await runSync(transport, include);
        await changed();
        if (r.failed > 0)
          notify(`${r.failed} change${r.failed === 1 ? '' : 's'} failed to sync. They stay queued — open Sync status to retry.`, { tone: 'error' });
        else if (!quiet) notify(r.synced ? `Simulated sync complete: ${r.synced} change${r.synced === 1 ? '' : 's'} marked synced.` : 'Nothing to sync.', { tone: r.synced ? 'success' : 'info' });
        return r;
      } catch (e) {
        notify(errorMessage(e), { tone: 'error' });
        return null;
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    [transport, changed, notify],
  );

  const ready = snap !== null;
  const autoSync = snap?.settings.autoSync ?? false;

  // Simulated auto-sync: when online, drain "pending" shortly after changes.
  useEffect(() => {
    if (!ready || !online || !autoSync || pendingCount === 0 || syncing) return;
    const t = setTimeout(() => void doSync(['pending'], true), 1200);
    return () => clearTimeout(t);
  }, [ready, online, autoSync, pendingCount, syncing, doSync]);

  // Tell the user when connectivity changes.
  const prevOnline = useRef(online);
  useEffect(() => {
    if (prevOnline.current === online) return;
    prevOnline.current = online;
    if (!ready) return;
    if (online) notify(pendingCount ? `Back online. ${pendingCount} queued change${pendingCount === 1 ? '' : 's'} will sync.` : 'Back online.', { tone: 'success' });
    else notify('You’re offline. Sales and stock changes are saved on this device and queued for sync.', { tone: 'warning' });
  }, [online, ready, pendingCount, notify]);

  const user = liveUser;
  const users = useMemo(() => {
    if (!liveUser) return [];
    if (liveUser.role === 'owner') {
      const cashiers = staffUsers.filter((u) => u.id !== liveUser.id);
      return [liveUser, ...cashiers];
    }
    return [liveUser];
  }, [liveUser, staffUsers]);

  const actor = useMemo(() => ({ id: user?.id ?? '', name: user?.name ?? '' }), [user?.id, user?.name]);

  const actions = useMemo<StoreActions>(() => {
    const run = async <T,>(fn: () => Promise<T>): Promise<T> => {
      const r = await fn();
      await changed();
      return r;
    };
    return {
      createProduct: async (input) => {
        const saved = await createProductApi(input);

        return run(() => commands.createProduct(input, actor, saved.id));
      },
      updateProduct: async (id, input) => {
        await updateProductApi(id, input);

        return run(() =>
          commands.updateProduct(id, input, actor)
        );
      },
      deleteProduct: async (id) => {
        await deleteProductApi(id);

        return run(() =>
          commands.deleteProduct(id)
        );
      },
      restock: async (productId, quantity, note) => {
        const res = await adjustStockApi(productId, 'restock', quantity, note, actor.name);
        return run(() => commands.adjustStock(productId, { kind: 'restock', quantity, note }, actor, res.movement.id));
      },
      setStock: async (productId, counted, note) => {
        const res = await adjustStockApi(productId, 'set', counted, note, actor.name);
        return run(() => commands.adjustStock(productId, { kind: 'set', quantity: counted, note }, actor, res.movement.id));
      },
      recordSale: async (input) => {
        const items = input.lines.map((l) => {
          const prod = snap?.products.find((p) => p.id === l.productId);
          return {
            productId: l.productId,
            name: prod?.name ?? 'Unknown',
            sku: prod?.sku ?? '',
            qty: l.qty,
            price: prod?.price ?? 0,
            cost: prod?.cost ?? 0,
          };
        });

        const totals = computeTotals(
          items,
          { type: input.discountType, value: input.discountValue },
          {
            enabled: snap!.settings.taxEnabled,
            rate: snap!.settings.taxRate,
            inclusive: snap!.settings.taxInclusive,
          }
        );

        let tendered: number | undefined;
        let change: number | undefined;
        if (input.method === 'Cash') {
          tendered = input.tendered ?? totals.total;
          change = changeDue(tendered, totals.total);
        }

        const savedSale = await recordSaleApi({
          items,
          subtotal: totals.subtotal,
          discountType: input.discountType,
          discountValue: input.discountValue,
          discount: totals.discount,
          taxLabel: snap!.settings.taxEnabled ? snap!.settings.taxLabel : '',
          taxRate: snap!.settings.taxEnabled ? snap!.settings.taxRate : 0,
          taxInclusive: snap!.settings.taxEnabled ? snap!.settings.taxInclusive : false,
          tax: totals.tax,
          total: totals.total,
          tendered,
          change,
          method: input.method,
          cashierId: actor.id,
          cashierName: actor.name,
        });

        return run(() =>
          commands.recordSale(input, actor, snap!.settings, {
            id: savedSale.id,
            receipt: savedSale.receipt,
            time: savedSale.time,
          })
        );
      },
      refundSale: async (saleId, reason, items) => {
        const res = await refundSaleApi(saleId, reason, items);
        await refresh();
        return res.sale;
      },
      saveSettings: async (settings) => {
        const saved = await saveSettingsApi(settings);
        return run(() => commands.saveSettings(saved));
      },
      switchUser: async () => {
        throw new Error('Role switching requires credential verification. Please sign in with account credentials.');
      },
      loginOwner: async (email, password) => {
        const u = await loginOwnerApi({ email, password });
        setLiveUser(u);
        setAuthenticated(true);
        await refreshAuth();
        await refresh();
        return u;
      },
      loginPin: async (userId, pin) => {
        const u = await loginPinApi({ userId, pin });
        setLiveUser(u);
        setAuthenticated(true);
        await refreshAuth();
        await refresh();
        return u;
      },
      logout: async () => {
        try {
          await logoutApi();
          // Server confirmed session revocation
          setLiveUser(null);
          setAuthenticated(false);
          setStaffUsers([]);
          await commands.clearSessionUser().catch(() => undefined);
          await refreshAuth().catch(() => undefined);
        } catch (err: any) {
          console.error('Logout error:', err);
          // Recheck /api/auth/status before deciding whether the user is still authenticated
          let serverStillAuthenticated = false;
          try {
            const status = await fetchAuthStatus();
            setInitialized(status.initialized);
            setAuthenticated(status.authenticated);
            if (status.authenticated && status.user) {
              setLiveUser(status.user);
              serverStillAuthenticated = true;
            } else {
              setLiveUser(null);
              setStaffUsers([]);
              await commands.clearSessionUser().catch(() => undefined);
            }
          } catch (recheckErr) {
            console.error('Failed to recheck auth status after failed logout:', recheckErr);
          }

          const message = err?.message || 'Logout failed. Please check your connection.';
          notify(message, { tone: 'error' });
          if (serverStillAuthenticated) {
            throw err;
          }
        }
      },
      createCashier: async (name, pin) => {
        const u = await createCashierApi({ name, pin });
        await refreshAuth();
        return u;
      },
      updateUser: async (id, input) => {
        const u = await updateUserApi(id, input);
        await refreshAuth();
        return u;
      },
      deleteUser: async (id) => {
        await deleteUserApi(id);
        await refreshAuth();
      },
      resetCashierPin: async (id, pin, confirmPin) => {
        const u = await resetCashierPinApi(id, { pin, confirmPin });
        await refreshAuth();
        return u;
      },
      refreshAuth: async () => {
        await refreshAuth();
      },
      resetDemo: async () => {
        await clearDatabaseApi({ resetSettings: true });
        return run(() => seedDemo());
      },
      clearAll: async () => {
        await clearDatabaseApi({ resetSettings: false });
        return run(() => clearAllData());
      },
    };
  }, [actor, changed, refresh, refreshAuth, snap]);

  const value = useMemo<StoreValue | null>(() => {
    if (!snap || !user) return null;
    return {
      products: snap.products,
      sales: snap.sales,
      movements: snap.movements,
      queue: snap.queue,
      settings: snap.settings,
      deviceId: snap.deviceId,
      user,
      users,
      initialized: initialized ?? false,
      authenticated,
      can: (p) => canDo(user.role, p),
      online,
      deviceOnline,
      simulatedOffline,
      setSimulatedOffline,
      simulateFailure,
      setSimulateFailure,
      syncing,
      pendingCount,
      failedCount,
      transportName: transport.name,
      syncNow: async () => {
        if (!online) {
          notify(`You’re offline. ${pendingCount + failedCount} change${pendingCount + failedCount === 1 ? '' : 's'} stay queued.`, { tone: 'warning' });
          return null;
        }
        return doSync(['pending', 'failed'], false);
      },
      clearSyncedHistory: async () => {
        await clearSyncHistory();
        await changed();
      },
      actions,
    };
  }, [snap, user, users, initialized, authenticated, online, deviceOnline, simulatedOffline, simulateFailure, syncing, pendingCount, failedCount, transport, doSync, changed, notify, actions]);

  if (bootError) return <BootError message={bootError} onRetry={() => void boot()} />;
  if (authLoading || !snap) return <Splash />;

  if (initialized === false) {
    return (
      <div id="app-root" className="min-h-dvh bg-bg">
        <InitialSetupModal
          open={true}
          onComplete={(owner) => {
            setLiveUser(owner);
            setAuthenticated(true);
            setInitialized(true);
            void refreshAuth();
            void refresh();
          }}
        />
      </div>
    );
  }

  if (!authenticated || !user || !value) {
    return (
      <div id="app-root" className="min-h-dvh bg-bg">
        <AuthScreen
          onLoginSuccess={(u) => {
            setLiveUser(u);
            setAuthenticated(true);
            void refreshAuth();
            void refresh();
          }}
        />
      </div>
    );
  }

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
}

/** Turn any thrown value into a user-facing message (ValidationErrors are already friendly). */
export const userMessage = (e: unknown): string =>
  e instanceof ValidationError ? e.message : e instanceof Error ? `Couldn’t save: ${e.message}` : 'Something went wrong.';
