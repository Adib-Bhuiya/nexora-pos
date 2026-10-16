'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, CircleX, Download, Plus, Receipt as ReceiptIcon, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { Receipt } from '@/components/receipt/Receipt';
import { Button } from '@/components/ui/Button';
import { Card, CardHead, EmptyState, Notice, PageHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Input, Segmented, SelectField, SwitchRow, TextAreaField, TextField } from '@/components/ui/Fields';
import { Avatar, StatusPill, TableWrap, Td, Th } from '@/components/ui/Bits';
import { useToast } from '@/components/ui/Toast';
import { CURRENCIES } from '@/config/constants';
import { CAPABILITIES, ROLE_LABEL } from '@/config/permissions';
import { exportAll } from '@/db/snapshot';
import { applyUpdate, useServiceWorker } from '@/hooks/useServiceWorker';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { downloadFile } from '@/lib/csv';
import { cn } from '@/lib/cn';
import { validateSettingsDraft, type Errors, type SettingsDraft } from '@/lib/validation';
import { useStore, userMessage } from '@/store/StoreProvider';
import type { Sale, Settings as SettingsType } from '@/types';

const toDraft = (s: SettingsType): SettingsDraft => ({ ...s, taxRate: String(s.taxRate), lowStockThreshold: String(s.lowStockThreshold) });

export default function SettingsPage() {
  const { settings, user, users, can, actions, products, pendingCount } = useStore();
  const { notify } = useToast();
  const canWrite = can('settings:write');
  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(settings));
  const [errors, setErrors] = useState<Errors<keyof SettingsDraft>>({});
  const [newCategory, setNewCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'reset' | 'clear'>(null);

  // Pick up changes saved elsewhere (another tab) while the form is untouched.
  const saved = useMemo(() => JSON.stringify(toDraft(settings)), [settings]);
  const dirty = JSON.stringify(draft) !== saved;
  useEffect(() => {
    if (!dirty) setDraft(toDraft(settings));
  }, [saved]);

  const set = <K extends keyof SettingsDraft>(k: K, v: SettingsDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const save = async () => {
    const { errors: errs, value } = validateSettingsDraft(draft);
    setErrors(errs);
    if (!value) {
      notify('Fix the highlighted fields to save.', { tone: 'error' });
      return;
    }
    setBusy(true);
    try {
      await actions.saveSettings(value);
      notify('Settings saved.', { tone: 'success' });
    } catch (e) {
      notify(userMessage(e), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const addCategory = () => {
    const c = newCategory.trim();
    if (!c) return;
    if (draft.categories.some((x) => x.toLowerCase() === c.toLowerCase())) return notify('That category already exists.', { tone: 'warning' });
    set('categories', [...draft.categories, c]);
    setNewCategory('');
  };
  const removeCategory = (c: string) => {
    if (products.some((p) => p.category === c)) return notify(`“${c}” is used by products. Move them first.`, { tone: 'warning' });
    if (draft.categories.length <= 1) return notify('Keep at least one category.', { tone: 'warning' });
    set('categories', draft.categories.filter((x) => x !== c));
  };

  const previewSale: Sale | null = useMemo(() => {
    const p = products[0];
    if (!p) return null;
    const previewItem = { productId: p.id, name: p.name, sku: p.sku, qty: 1, price: p.price, cost: p.cost };
    const sub = previewItem.price * previewItem.qty;
    return {
      id: 'TXN-00001',
      receipt: `${draft.receiptPrefix || 'NX'}-00001`,
      time: new Date().toISOString(),
      cashierId: user.id,
      cashierName: user.name,
      method: 'Cash',
      items: [previewItem],
      subtotal: sub,
      discountType: 'fixed',
      discountValue: 0,
      discount: 0,
      taxLabel: draft.taxLabel,
      taxRate: Number(draft.taxRate) || 0,
      taxInclusive: draft.taxInclusive,
      tax: 0,
      total: sub,
      tendered: sub,
      change: 0,
      syncStatus: 'pending',
    };
  }, [products, draft.receiptPrefix, draft.taxLabel, draft.taxRate, draft.taxInclusive, user.id, user.name]);
  const previewSettings: SettingsType = { ...draft, taxRate: Number(draft.taxRate) || 0, lowStockThreshold: Number(draft.lowStockThreshold) || 0 };

  return (
    <>
      <PageHeader eyebrow="ADMINISTRATION" title="Staff & settings" sub="Configure store settings and test staff roles." />

      <div className="grid gap-[18px] lg:grid-cols-2">
        {/* ---------- staff roles ---------- */}
        <Card className="p-[19px] max-md:p-3.5 lg:col-span-2">
          <CardHead title="Staff profiles" sub="Select an active operator profile to test role permissions." />
          <Notice tone="info" icon={<ShieldAlert size={15} />}>
            <strong>Staff Role Switcher</strong>: Select an active operator profile to test role-based access control (Administrator or Cashier) in the POS interface.
          </Notice>
          <div className="mt-4 grid gap-2.5 md:grid-cols-2" role="radiogroup" aria-label="Staff profile">
            {users.map((u) => {
              const active = u.id === user.id;
              return (
                <button key={u.id} type="button" role="radio" aria-checked={active} onClick={async () => { if (!active) { await actions.switchUser(u.id); notify(`Now viewing as ${u.name} (${ROLE_LABEL[u.role]}).`); } }}
                  className={cn('flex items-center gap-3 rounded-[12px] border p-3.5 text-left transition-[transform,border-color,background-color] duration-100 active:scale-[.98]', active ? 'border-brand bg-brand-soft' : 'border-line bg-white hover:bg-[#f8faff]')}>
                  <Avatar initials={u.initials} size={38} />
                  <span className="min-w-0 flex-1"><span className="block text-[13px] font-bold">{u.name}</span><span className="block text-[11px] text-muted">{ROLE_LABEL[u.role]}</span></span>
                  {active && <Check size={16} className="text-brand" aria-hidden />}
                </button>
              );
            })}
          </div>
          <div className="mt-4 overflow-hidden rounded-[11px] border border-line">
            <TableWrap>
              <thead><tr><Th className="!border-t-0">What each role can do</Th><Th align="right" className="!border-t-0">Admin</Th><Th align="right" className="!border-t-0">Cashier</Th></tr></thead>
              <tbody>
                {CAPABILITIES.map((c) => (
                  <tr key={c.label}>
                    <Td className="!whitespace-normal">{c.label}</Td>
                    <Td align="right"><Mark ok={c.admin} /></Td>
                    <Td align="right"><Mark ok={c.cashier} /></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        </Card>

        {!canWrite && (
          <div className="lg:col-span-2"><Notice tone="info">Only administrators can change store settings. Switch to <b>Administrator</b> above to edit them.</Notice></div>
        )}

        <fieldset disabled={!canWrite || busy} className="contents">
          <Card className="p-[19px] max-md:p-3.5">
            <CardHead title="Store information" sub="Printed on every receipt." />
            <div className="space-y-4">
              <TextField label="Store name" value={draft.storeName} onChange={(e) => set('storeName', e.target.value)} error={errors.storeName} maxLength={60} />
              <TextAreaField label="Address" value={draft.address} onChange={(e) => set('address', e.target.value)} maxLength={160} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Phone" type="tel" value={draft.phone} onChange={(e) => set('phone', e.target.value)} />
                <TextField label="Email" type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} error={errors.email} />
              </div>
              <TextField label="Tax / business ID (optional)" value={draft.taxId} onChange={(e) => set('taxId', e.target.value)} />
            </div>
          </Card>

          <Card className="p-[19px] max-md:p-3.5">
            <CardHead title="Currency & tax" />
            <div className="space-y-4">
              <SelectField label="Currency" value={draft.currencyCode} onChange={(e) => set('currencyCode', e.target.value)}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </SelectField>
              <SwitchRow label="Charge tax on sales" description="Applies to new sales. Past receipts are unchanged." checked={draft.taxEnabled} onChange={(v) => set('taxEnabled', v)} />
              {draft.taxEnabled && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField label="Tax label" value={draft.taxLabel} onChange={(e) => set('taxLabel', e.target.value)} error={errors.taxLabel} maxLength={12} />
                    <TextField label="Rate (%)" type="number" inputMode="decimal" min={0} max={100} step="any" value={draft.taxRate} onChange={(e) => set('taxRate', e.target.value)} error={errors.taxRate} />
                  </div>
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-muted">Listed prices</div>
                    <Segmented<'excl' | 'incl'> label="Tax mode" value={draft.taxInclusive ? 'incl' : 'excl'} onChange={(v) => set('taxInclusive', v === 'incl')} options={[{ value: 'excl', label: 'Tax added at checkout' }, { value: 'incl', label: 'Already include tax' }]} />
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card className="p-[19px] max-md:p-3.5">
            <CardHead title="Receipts" />
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Receipt prefix" value={draft.receiptPrefix} onChange={(e) => set('receiptPrefix', e.target.value.toUpperCase())} error={errors.receiptPrefix} maxLength={6} />
                <div>
                  <div className="mb-1.5 text-xs font-semibold text-muted">Paper width</div>
                  <Segmented<'58mm' | '80mm'> label="Paper width" value={draft.receiptPaper} onChange={(v) => set('receiptPaper', v)} options={[{ value: '58mm', label: '58 mm' }, { value: '80mm', label: '80 mm' }]} />
                </div>
              </div>
              <TextField label="Header note (optional)" value={draft.receiptHeader} onChange={(e) => set('receiptHeader', e.target.value)} maxLength={80} />
              <TextField label="Footer message" value={draft.receiptFooter} onChange={(e) => set('receiptFooter', e.target.value)} maxLength={80} />
              <div className="divide-y divide-line">
                <SwitchRow label="Show cashier name" checked={draft.receiptShowCashier} onChange={(v) => set('receiptShowCashier', v)} />
                <SwitchRow label="Show tax / business ID" checked={draft.receiptShowTaxId} onChange={(v) => set('receiptShowTaxId', v)} />
                <SwitchRow label="Open print dialog after each sale" checked={draft.autoPrint} onChange={(v) => set('autoPrint', v)} />
              </div>
            </div>
          </Card>

          <Card className="p-[19px] max-md:p-3.5">
            <CardHead title="Receipt preview" sub={previewSale ? 'Updates as you type.' : 'Live layout preview.'} />
            {previewSale ? (
              <Receipt sale={previewSale} settings={previewSettings} />
            ) : (
              <EmptyState
                icon={<ReceiptIcon size={20} />}
                title="No products in catalog"
                text="Add products to your catalog to generate a live receipt preview."
              />
            )}
          </Card>

          <Card className="p-[19px] max-md:p-3.5">
            <CardHead title="Inventory" />
            <div className="space-y-4">
              <TextField label="Low-stock warning at (units)" type="number" inputMode="numeric" min={0} step={1} value={draft.lowStockThreshold} onChange={(e) => set('lowStockThreshold', e.target.value)} error={errors.lowStockThreshold} />
              <div>
                <div className="mb-1.5 text-xs font-semibold text-muted">Product categories</div>
                <ul className="mb-2.5 flex flex-wrap gap-1.5">
                  {draft.categories.map((c) => (
                    <li key={c} className="inline-flex items-center gap-1 rounded-full bg-[#eef1f6] py-1 pl-3 pr-1.5 text-xs font-semibold">
                      {c}
                      <button type="button" aria-label={`Remove category ${c}`} onClick={() => removeCategory(c)} className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-white hover:text-danger"><X size={12} /></button>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }} placeholder="New category" aria-label="New category name" maxLength={30} />
                  <Button onClick={addCategory}><Plus size={14} aria-hidden /> Add</Button>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-[19px] max-md:p-3.5">
            <CardHead title="Sync" sub="Simulated. No server is connected." />
            <SwitchRow label="Auto-sync when online" description="Marks queued changes as synced shortly after they’re made." checked={draft.autoSync} onChange={(v) => set('autoSync', v)} />
            <p className="mt-1 text-[11px] text-muted">{pendingCount} change{pendingCount === 1 ? '' : 's'} waiting. Open <b>Sync status</b> in the top bar to inspect them.</p>
          </Card>
        </fieldset>

        {canWrite && (
          <div className="material sticky bottom-3 z-20 flex items-center justify-between gap-3 rounded-[14px] border border-line px-4 py-3 shadow-[0_8px_28px_#1720331f] lg:col-span-2">
            <span className="text-xs text-muted">{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</span>
            <div className="flex gap-2">
              <Button onClick={() => { setDraft(toDraft(settings)); setErrors({}); }} disabled={!dirty || busy}>Discard</Button>
              <Button variant="primary" onClick={() => void save()} loading={busy} disabled={!dirty}>Save settings</Button>
            </div>
          </div>
        )}

        <AppCard />
        <DataCard canWrite={canWrite} onClear={() => setConfirm('clear')} />
      </div>

      <ConfirmDialog
        open={confirm === 'clear'}
        title="Delete all data?"
        tone="danger"
        confirmLabel="Delete everything"
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await actions.clearAll();
            setConfirm(null);
            notify('All products and sales deleted. You’re starting fresh.', { tone: 'success' });
          } catch (e) {
            notify(userMessage(e), { tone: 'error' });
          } finally {
            setBusy(false);
          }
        }}
        message="This permanently deletes every product, sale, and stock movement in the database and local storage. Export a backup first if you might need it. This can’t be undone."
      />
    </>
  );
}

const Mark = ({ ok }: { ok: boolean }) =>
  ok ? <Check size={16} className="inline text-ok" aria-label="Yes" /> : <CircleX size={16} className="inline text-[#c3cad6]" aria-label="No" />;

function AppCard() {
  const sw = useServiceWorker();
  const { online, deviceOnline } = useStore();
  const install = useInstallPrompt();
  const [storage, setStorage] = useState<{ used: number; persisted: boolean | null } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [est, persisted] = await Promise.all([navigator.storage?.estimate?.(), navigator.storage?.persisted?.()]);
        setStorage({ used: est?.usage ?? 0, persisted: persisted ?? null });
      } catch {
        setStorage(null);
      }
    })();
  }, []);

  const Row = ({ l, children }: { l: string; children: ReactNode }) => (
    <div className="flex items-center justify-between gap-3 border-b border-[#edf0f4] py-3 text-xs last:border-0"><span className="text-muted">{l}</span><span className="text-right font-semibold">{children}</span></div>
  );

  return (
    <Card className="p-[19px] max-md:p-3.5">
      <CardHead title="App & offline" sub="Progressive Web App status." />
      <Row l="Connection"><StatusPill tone={online ? 'good' : 'low'}>{online ? 'Online' : deviceOnline ? 'Offline (simulated)' : 'Offline'}</StatusPill></Row>
      <Row l="Offline app shell">
        {sw.offlineReady ? <StatusPill tone="good">Cached · works offline</StatusPill> : <StatusPill tone="neutral">{process.env.NODE_ENV !== 'production' ? 'Not in dev mode' : 'Not cached yet'}</StatusPill>}
      </Row>
      <Row l="Local storage">{storage ? `${(storage.used / 1024).toFixed(0)} KB · ${storage.persisted ? 'persistent' : 'best-effort'}` : 'IndexedDB'}</Row>
      <Row l="Install">
        {install.isInstalled ? 'Installed' : install.canInstall ? <Button size="sm" variant="primary" onClick={() => void install.install()}><Download size={13} aria-hidden /> Install app</Button> : <span className="font-normal text-muted">Use your browser’s “Install” / “Add to Home Screen”</span>}
      </Row>
      {sw.needRefresh && <div className="mt-3"><Button variant="primary" onClick={() => void applyUpdate()}><RefreshCw size={14} aria-hidden /> Update to the new version</Button></div>}
    </Card>
  );
}

function DataCard({ canWrite, onClear }: { canWrite: boolean; onClear: () => void }) {
  const { notify } = useToast();
  const backup = async () => {
    try {
      downloadFile(`nexora-pos-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportAll(), 'application/json');
    } catch (e) {
      notify(userMessage(e), { tone: 'error' });
    }
  };
  return (
    <Card className="p-[19px] max-md:p-3.5">
      <CardHead title="Your data" sub="Stored in database and locally cached." />
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-bold">Download a backup</div><div className="text-[11px] text-muted">Everything as a JSON file.</div></div><Button onClick={() => void backup()}><Download size={14} aria-hidden /> Export</Button></div>
        {canWrite ? (
          <div className="flex items-center justify-between gap-3 border-t border-[#edf0f4] pt-3"><div><div className="text-xs font-bold">Start with an empty store</div><div className="text-[11px] text-muted">Delete all products and sales.</div></div><Button variant="danger" onClick={onClear}>Delete all</Button></div>
        ) : (
          <p className="border-t border-[#edf0f4] pt-3 text-[11px] text-muted">Deleting data is limited to the Administrator role.</p>
        )}
      </div>
    </Card>
  );
}
