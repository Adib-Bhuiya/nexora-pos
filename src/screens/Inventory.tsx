'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, PackagePlus, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, EmptyState, MetricCard, PageHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Input, Segmented, Select, SelectField, TextField } from '@/components/ui/Fields';
import { ProductThumb, StatusPill, StockPill, TableWrap, Td, Th } from '@/components/ui/Bits';
import { useToast } from '@/components/ui/Toast';
import { ADJUST_REASONS } from '@/config/constants';
import { useFormat } from '@/hooks/useFormat';
import { inventoryReport } from '@/lib/analytics';
import { parseNumber, stockStatus } from '@/lib/calc';
import { cn } from '@/lib/cn';
import { useStore, userMessage } from '@/store/StoreProvider';
import type { MovementType, Product, StockStatus } from '@/types';

type Tab = 'levels' | 'history';
const PAGE = 50;
const TYPE_LABEL: Record<MovementType, string> = { initial: 'Opening', sale: 'Sale', restock: 'Restock', adjustment: 'Adjustment' };
const TYPE_TONE = { initial: 'neutral', sale: 'info', restock: 'good', adjustment: 'low' } as const;

export default function Inventory() {
  const { products, movements, settings, can } = useStore();
  const f = useFormat();
  const canWrite = can('inventory:write');
  const [tab, setTab] = useState<Tab>('levels');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | StockStatus>('all');
  const [dialog, setDialog] = useState<{ kind: 'restock' | 'count'; product: Product } | null>(null);
  const [mvType, setMvType] = useState<'all' | MovementType>('all');
  const [mvProduct, setMvProduct] = useState('all');
  const [shown, setShown] = useState(PAGE);

  const report = useMemo(() => inventoryReport(products, settings.lowStockThreshold), [products, settings.lowStockThreshold]);
  const q = query.trim().toLowerCase();
  const rows = products
    .filter((p) => (status === 'all' || stockStatus(p.stock, settings.lowStockThreshold) === status) && (!q || [p.name, p.sku].some((v) => v.toLowerCase().includes(q))))
    .sort((a, b) => a.stock - b.stock);
  const mv = movements.filter((m) => (mvType === 'all' || m.type === mvType) && (mvProduct === 'all' || m.productId === mvProduct));

  return (
    <>
      <PageHeader
        eyebrow="STOCK CONTROL"
        title="Inventory"
        sub={`Low-stock warning at ${settings.lowStockThreshold} units or fewer${canWrite ? '' : ' · view only for your role'}`}
        actions={<Segmented<Tab> label="Inventory view" value={tab} onChange={setTab} options={[{ value: 'levels', label: 'Stock levels' }, { value: 'history', label: 'Movements' }]} />}
      />

      <section aria-label="Inventory summary" className={cn('mb-[18px] grid grid-cols-2 gap-[13px] lg:gap-[18px]', can('costs:view') ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
        <MetricCard label="Units on hand" value={f.number(report.units)} foot={`${report.products} products`} />
        <MetricCard label="Low stock" value={report.low.length} foot={`≤ ${settings.lowStockThreshold} units`} tone={report.low.length ? 'warn' : undefined} />
        <MetricCard label="Out of stock" value={report.out.length} foot="Needs restocking" tone={report.out.length ? 'danger' : undefined} />
        {can('costs:view') && <MetricCard label="Stock value (cost)" value={f.whole(report.costValue)} foot={`Retail ${f.whole(report.retailValue)}`} />}
      </section>

      {tab === 'levels' ? (
        <Card className="overflow-hidden">
          <div className="flex gap-2.5 p-3.5 max-md:flex-col md:p-[19px]">
            <div className="relative flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa3b2]" aria-hidden />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product or SKU…" aria-label="Search inventory" className="pl-9" />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value as 'all' | StockStatus)} aria-label="Filter by status" className="md:max-w-[190px]">
              <option value="all">All stock levels</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
              <option value="good">In stock</option>
            </Select>
          </div>
          {rows.length === 0 ? (
            <EmptyState icon={<Search size={20} />} title={products.length ? 'No products match' : 'No products yet'} text={products.length ? 'Try a different search or filter.' : 'Add products first, then track their stock here.'} />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>SKU</Th>
                  <Th align="right">On hand</Th>
                  <Th>Status</Th>
                  {canWrite && <Th align="right">Actions</Th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-[#fafbfd]">
                    <Td><div className="flex items-center gap-3"><ProductThumb imageUrl={p.imageUrl} tone={p.tone} size={34} /><span className="font-bold text-ink">{p.name}</span></div></Td>
                    <Td>{p.sku}</Td>
                    <Td align="right" className="text-[13px] font-extrabold text-ink">{p.stock}</Td>
                    <Td><StockPill status={stockStatus(p.stock, settings.lowStockThreshold)} /></Td>
                    {canWrite && (
                      <Td align="right">
                        <div className="inline-flex gap-1.5">
                          <Button size="sm" onClick={() => setDialog({ kind: 'restock', product: p })}><PackagePlus size={13} aria-hidden /> Restock</Button>
                          <Button size="sm" onClick={() => setDialog({ kind: 'count', product: p })}><SlidersHorizontal size={13} aria-hidden /> Adjust</Button>
                        </div>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex gap-2.5 p-3.5 max-md:flex-col md:p-[19px]">
            <Select value={mvProduct} onChange={(e) => { setMvProduct(e.target.value); setShown(PAGE); }} aria-label="Filter by product" className="md:max-w-[260px]">
              <option value="all">All products</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Select value={mvType} onChange={(e) => { setMvType(e.target.value as 'all' | MovementType); setShown(PAGE); }} aria-label="Filter by type" className="md:max-w-[190px]">
              <option value="all">All movement types</option>
              {(Object.keys(TYPE_LABEL) as MovementType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </Select>
          </div>
          {mv.length === 0 ? (
            <EmptyState title="No stock movements" text="Sales, restocks and adjustments are recorded here." />
          ) : (
            <>
              <TableWrap>
                <thead>
                  <tr><Th>Time</Th><Th>Product</Th><Th>Type</Th><Th align="right">Change</Th><Th align="right">Balance</Th><Th>Note</Th><Th>By</Th></tr>
                </thead>
                <tbody>
                  {mv.slice(0, shown).map((m) => (
                    <tr key={m.id}>
                      <Td>{f.dateTime(m.time)}</Td>
                      <Td className="font-bold text-ink">{m.productName}</Td>
                      <Td><StatusPill tone={TYPE_TONE[m.type]}>{TYPE_LABEL[m.type]}</StatusPill></Td>
                      <Td align="right" className={cn('font-extrabold', m.change > 0 ? 'text-ok' : 'text-danger')}>
                        <span className="inline-flex items-center gap-0.5">{m.change > 0 ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />}{Math.abs(m.change)}<span className="sr-only">{m.change > 0 ? ' added' : ' removed'}</span></span>
                      </Td>
                      <Td align="right">{m.balanceAfter}</Td>
                      <Td>{m.note}</Td>
                      <Td>{m.actorName}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
              <div className="flex items-center justify-between border-t border-[#edf0f4] px-4 py-3 text-xs text-muted">
                <span>Showing {Math.min(shown, mv.length)} of {mv.length}</span>
                {shown < mv.length && <Button size="sm" onClick={() => setShown((n) => n + PAGE)}>Show more</Button>}
              </div>
            </>
          )}
        </Card>
      )}

      <StockDialog state={dialog} onClose={() => setDialog(null)} />
    </>
  );
}

function StockDialog({ state, onClose }: { state: { kind: 'restock' | 'count'; product: Product } | null; onClose: () => void }) {
  const { actions } = useStore();
  const { notify } = useToast();
  const [last, setLast] = useState(state);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState(ADJUST_REASONS[0]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<typeof state>(null);

  // Reset the form each time the dialog opens.
  if (state && state !== seen) {
    setSeen(state);
    setLast(state);
    setValue(state.kind === 'count' ? String(state.product.stock) : '');
    setReason(ADJUST_REASONS[0]);
    setNote('');
    setError('');
  }
  if (!state && seen) setSeen(null);

  const s = state ?? last;
  const isRestock = s?.kind === 'restock';
  const n = parseNumber(value);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!s) return;
    if (!Number.isInteger(n) || (isRestock ? n < 1 : n < 0)) {
      setError(isRestock ? 'Enter a whole number of at least 1.' : 'Enter the counted quantity (0 or more).');
      return;
    }
    setBusy(true);
    try {
      if (isRestock) await actions.restock(s.product.id, n, note);
      else await actions.setStock(s.product.id, n, [reason, note.trim()].filter(Boolean).join(' — '));
      notify(isRestock ? `Added ${n} to ${s.product.name}.` : `${s.product.name} count set to ${n}.`, { tone: 'success' });
      onClose();
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!state}
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      title={isRestock ? 'Restock' : 'Adjust stock count'}
      description={s ? `${s.product.name} · currently ${s.product.stock} on hand` : undefined}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" onClick={() => void submit()} loading={busy}>{isRestock ? 'Add stock' : 'Save count'}</Button></>}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField label={isRestock ? 'Units received' : 'Counted quantity'} type="number" inputMode="numeric" min={0} step={1} value={value} onChange={(e) => { setValue(e.target.value); setError(''); }} error={error} />
        {isRestock && (
          <div className="flex flex-wrap gap-1.5">
            {[5, 10, 25, 50].map((q) => (
              <button key={q} type="button" onClick={() => { setValue(String(q)); setError(''); }} className="rounded-full border border-line bg-white px-3 py-1.5 text-[11px] font-bold hover:bg-[#f8faff] active:scale-95">+{q}</button>
            ))}
          </div>
        )}
        {!isRestock && <SelectField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>{ADJUST_REASONS.map((r) => <option key={r}>{r}</option>)}</SelectField>}
        <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder={isRestock ? 'e.g. Supplier delivery' : 'Anything worth remembering'} maxLength={120} />
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
