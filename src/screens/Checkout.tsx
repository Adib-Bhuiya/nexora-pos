'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Minus, Package, PackageSearch, Plus, Printer, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { Receipt } from '@/components/receipt/Receipt';
import { SaleSyncPill } from '@/components/receipt/SaleDialog';
import { Button } from '@/components/ui/Button';
import { Card, EmptyState, Notice, PageHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Input, Select, Segmented, TextField } from '@/components/ui/Fields';
import { ProductThumb } from '@/components/ui/Bits';
import { useToast } from '@/components/ui/Toast';
import { useFormat } from '@/hooks/useFormat';
import { PAYMENT_METHODS } from '@/config/constants';
import { changeDue, parseNumber, stockStatus, suggestTenders } from '@/lib/calc';
import { cn } from '@/lib/cn';
import { useCart } from '@/store/CartProvider';
import { usePrint } from '@/store/PrintProvider';
import { useStore, userMessage } from '@/store/StoreProvider';
import type { PaymentMethod, Sale } from '@/types';

import Link from 'next/link';
import { buttonClasses } from '@/components/ui/Button';

export default function Checkout() {
  const { products, settings, refreshProducts } = useStore();
  const cart = useCart();
  const f = useFormat();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [payOpen, setPayOpen] = useState(false);
  const [done, setDone] = useState<Sale | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { notify } = useToast();

  // Background product refresh every 15s, paused when tab is hidden
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (intervalId) return;
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
          void refreshProducts({ silent: true });
        }
      }, 15000);
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshProducts({ silent: true });
        startPolling();
      } else {
        stopPolling();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    startPolling();

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshProducts]);

  // "/" jumps to search (like most POS / web apps).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.isContentEditable && !document.querySelector('[role=dialog]')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const categories = useMemo(() => [...new Set([...settings.categories, ...products.map((p) => p.category)])], [settings.categories, products]);
  const q = query.trim().toLowerCase();
  const list = products.filter(
    (p) => (category === 'all' || p.category === category) && (!q || [p.name, p.sku, p.barcode].some((v) => v.toLowerCase().includes(q))),
  );

  const qtyIn = (id: string) => cart.lines.find((l) => l.product.id === id)?.qty ?? 0;

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !q) return;
    // Barcode scanners type the code then press Enter: exact barcode / SKU match adds straight to the cart.
    const exact = products.find((p) => p.barcode.toLowerCase() === q || p.sku.toLowerCase() === q);
    const hit = exact ?? (list.length === 1 ? list[0] : undefined);
    if (hit) {
      cart.add(hit);
      setQuery('');
    } else notify(list.length ? 'Several products match. Tap the one you want.' : `No product matches “${query.trim()}”.`, { tone: 'warning' });
  };

  const startNewSale = () => {
    setDoneOpen(false);
    searchRef.current?.focus();
  };

  return (
    <>
      <PageHeader eyebrow="POINT OF SALE" title="New sale" sub="Search or scan a product, tap to add, then take payment." />

      <div className="grid items-start gap-[18px] md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-label="Products">
          <div className="mb-3.5 flex gap-2.5 max-md:flex-col">
            <div className="relative flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa3b2]" aria-hidden />
              <Input
                ref={searchRef}
                type="search"
                inputMode="search"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder="Search name, SKU or scan barcode…   ( / )"
                aria-label="Search products"
                className="pl-9"
              />
            </div>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category" className="md:max-w-[190px]">
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>

          {products.length === 0 ? (
            <Card>
              <EmptyState
                icon={<PackageSearch size={20} />}
                title="No products yet"
                text="Add products to your catalog before you can start selling."
                action={<Link href="/products" className={buttonClasses('primary')}><Plus size={14} aria-hidden /> Add product</Link>}
              />
            </Card>
          ) : list.length === 0 ? (
            <Card><EmptyState icon={<Search size={20} />} title="No matching products" text="Try a different search or category." action={<Button onClick={() => { setQuery(''); setCategory('all'); }}>Clear filters</Button>} /></Card>
          ) : (
            <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3 min-[1500px]:grid-cols-4 max-md:gap-2.5">
              {list.map((p) => {
                const status = stockStatus(p.stock, settings.lowStockThreshold);
                const inCart = qtyIn(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => cart.add(p)}
                    aria-disabled={p.stock < 1}
                    aria-label={`${p.name}, ${f.money(p.price)}, ${p.stock} in stock${inCart ? `, ${inCart} in cart` : ''}`}
                    className={cn(
                      'relative rounded-[14px] border bg-white p-3.5 text-left shadow-card transition-[transform,border-color,box-shadow] duration-100 hover:border-[#c8d6ff] active:scale-[.97]',
                      inCart ? 'border-brand' : 'border-line',
                      p.stock < 1 && 'opacity-55',
                    )}
                  >
                    {inCart > 0 && <span className="absolute right-2.5 top-2.5 grid h-[22px] min-w-[22px] place-items-center rounded-full bg-brand px-1.5 text-[11px] font-extrabold text-white">{inCart}</span>}
                    <ProductCardMedia url={p.imageUrl} name={p.name} tone={p.tone} />
                    <div className="line-clamp-2 min-h-[34px] text-xs font-bold leading-[1.4]">{p.name}</div>
                    <div className="mt-1.5 flex items-center justify-between gap-1">
                      <span className="tabular text-[13px] font-extrabold text-brand">{f.money(p.price)}</span>
                      <span className={cn('text-[10px] font-semibold', status === 'good' ? 'text-muted' : status === 'low' ? 'text-warn' : 'text-danger')}>{status === 'out' ? 'Out of stock' : `${p.stock} left`}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <CartPanel onCheckout={() => setPayOpen(true)} />
      </div>

      {/* Floating summary on phones, where the cart sits below the grid. */}
      {cart.itemCount > 0 && (
        <a href="#cart" className="material fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-30 flex items-center justify-between rounded-2xl border border-line px-4 py-3 shadow-[0_8px_28px_#17203322] active:scale-[.98] md:hidden">
          <span className="flex items-center gap-2 text-xs font-bold"><ShoppingCart size={16} aria-hidden /> {cart.itemCount} item{cart.itemCount === 1 ? '' : 's'}</span>
          <span className="tabular text-[15px] font-extrabold">{f.money(cart.totals.total)}</span>
        </a>
      )}
      {cart.itemCount > 0 && <div className="h-16 md:hidden" aria-hidden />}

      <PayDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onDone={(sale) => {
          setPayOpen(false);
          setDone(sale);
          setDoneOpen(true);
        }}
      />
      <DoneDialog sale={done} open={doneOpen} onNew={startNewSale} />
    </>
  );
}

function CartPanel({ onCheckout }: { onCheckout: () => void }) {
  const cart = useCart();
  const { settings } = useStore();
  const f = useFormat();
  const t = cart.totals;

  return (
    <aside id="cart" aria-label="Cart" className="scroll-mt-[150px] md:sticky md:top-[96px]">
      <Card className="p-[19px] max-md:p-3.5">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold tracking-[-0.2px]">Current cart</h2>
          {cart.lines.length > 0 && <Button size="sm" variant="ghost" onClick={cart.clear}>Clear</Button>}
        </div>

        {cart.lines.length === 0 ? (
          <EmptyState icon={<ShoppingCart size={20} />} title="Cart is empty" text="Tap a product to add it." />
        ) : (
          <ul className="max-h-[42vh] divide-y divide-[#edf0f4] overflow-y-auto overscroll-contain md:max-h-[44vh]">
            {cart.lines.map((l) => (
              <li key={l.product.id} className="py-3">
                <div className="flex items-start gap-3">
                  <ProductThumb
                    imageUrl={l.product.imageUrl}
                    tone={l.product.tone}
                    size={34}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold leading-snug">{l.product.name}</div>
                    <div className="tabular text-[11px] text-muted">{f.money(l.product.price)} each</div>
                  </div>
                  <div className="tabular text-xs font-extrabold">{f.money(l.lineTotal)}</div>
                </div>
                <div className="mt-2 flex items-center justify-between pl-[46px]">
                  <div className="inline-flex items-center gap-1">
                    <button type="button" aria-label={`Decrease ${l.product.name}`} onClick={() => cart.setQty(l.product.id, l.qty - 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white transition-transform duration-100 active:scale-90"><Minus size={14} /></button>
                    <span className="tabular w-8 text-center text-xs font-extrabold" aria-live="polite">{l.qty}</span>
                    <button type="button" aria-label={`Increase ${l.product.name}`} onClick={() => cart.setQty(l.product.id, l.qty + 1)} disabled={l.qty >= l.product.stock} className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white transition-transform duration-100 active:scale-90 disabled:opacity-40"><Plus size={14} /></button>
                  </div>
                  <button type="button" onClick={() => cart.remove(l.product.id)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold text-danger hover:bg-[#fff5f6]"><Trash2 size={12} aria-hidden /> Remove</button>
                </div>
                {l.overStock && <p role="alert" className="mt-1.5 pl-[46px] text-[11px] font-semibold text-danger">Only {l.product.stock} in stock. Lower the quantity.</p>}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3.5 border-t border-[#edf0f4] pt-3.5 text-xs">
          <div className="tabular space-y-2">
            <div className="flex justify-between"><span className="text-muted">Subtotal</span><b>{f.money(t.subtotal)}</b></div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="discount" className="text-muted">Discount</label>
              <div className="flex items-center gap-1.5">
                <Segmented<'fixed' | 'percent'> label="Discount type" value={cart.discountType} onChange={cart.setDiscountType} options={[{ value: 'fixed', label: f.symbol }, { value: 'percent', label: '%' }]} />
                <Input id="discount" type="number" inputMode="decimal" min={0} step="any" value={cart.discountInput} onChange={(e) => cart.setDiscountInput(e.target.value)} placeholder="0" aria-invalid={!!cart.discountError || undefined} className="w-[84px] !py-[7px] text-right" />
              </div>
            </div>
            {cart.discountError && <p role="alert" className="text-right text-[11px] text-danger">{cart.discountError}</p>}
            {t.discount > 0 && <div className="flex justify-between"><span className="text-muted">Discount applied</span><b className="text-ok">−{f.money(t.discount)}</b></div>}
            {settings.taxEnabled && <div className="flex justify-between"><span className="text-muted">{settings.taxLabel} ({settings.taxRate}%{settings.taxInclusive ? ', included' : ''})</span><b>{f.money(t.tax)}</b></div>}
            <div className="flex items-baseline justify-between border-t border-[#edf0f4] pt-3 text-[18px] font-extrabold tracking-[-0.4px]"><span>Total</span><span>{f.money(t.total)}</span></div>
          </div>

          <label htmlFor="method" className="mb-1.5 mt-4 block font-semibold text-muted">Payment method</label>
          <Select id="method" value={cart.method} onChange={(e) => cart.setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
          </Select>

          <Button variant="primary" className="mt-3.5 w-full !py-3 !text-[13px]" onClick={onCheckout} disabled={cart.lines.length === 0 || cart.hasIssues || t.total <= 0}>
            Complete sale · {f.money(t.total)}
          </Button>
          <p className="mt-2.5 text-center text-[10px] text-muted">Transactions are saved locally on this device.</p>
        </div>
      </Card>
    </aside>
  );
}

function PayDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (s: Sale) => void }) {
  const cart = useCart();
  const { actions } = useStore();
  const f = useFormat();
  const { notify } = useToast();
  const { settings } = useStore();
  const { printSale } = usePrint();
  const [tendered, setTendered] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const total = cart.totals.total;

  useEffect(() => {
    if (open) {
      setTendered(String(total));
      setError('');
    }
  }, [open]);

  const isCash = cart.method === 'Cash';
  const amount = parseNumber(tendered);
  const tenderError = isCash && (!Number.isFinite(amount) || amount < total) ? `Enter at least ${f.money(total)}.` : undefined;

  const confirm = async () => {
    if (tenderError) return;
    setBusy(true);
    setError('');
    try {
      const sale = await actions.recordSale({
        lines: cart.lines.map((l) => ({ productId: l.product.id, qty: l.qty })),
        discountType: cart.discountType,
        discountValue: cart.discountError || cart.discountInput.trim() === '' ? 0 : Number(cart.discountInput),
        method: cart.method,
        tendered: isCash ? amount : undefined,
      });
      cart.clear();
      onDone(sale);
      if (settings.autoPrint) printSale(sale);
    } catch (e) {
      const msg = userMessage(e);
      setError(msg);
      notify(msg, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="md"
      title="Confirm payment"
      description="Review the sale before taking payment."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Back to cart</Button>
          <Button variant="primary" onClick={confirm} loading={busy} disabled={!!tenderError}>Confirm · {f.money(total)}</Button>
        </>
      }
    >
      <ul className="mb-4 divide-y divide-[#edf0f4] rounded-[11px] border border-line px-3.5">
        {cart.lines.map((l) => (
          <li key={l.product.id} className="flex justify-between gap-3 py-2.5 text-xs">
            <span className="min-w-0 truncate">{l.qty} × {l.product.name}</span>
            <span className="tabular font-bold">{f.money(l.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <dl className="tabular space-y-1.5 text-xs">
        <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{f.money(cart.totals.subtotal)}</dd></div>
        {cart.totals.discount > 0 && <div className="flex justify-between"><dt className="text-muted">Discount</dt><dd>−{f.money(cart.totals.discount)}</dd></div>}
        {cart.totals.tax > 0 && <div className="flex justify-between"><dt className="text-muted">{settings.taxLabel}</dt><dd>{f.money(cart.totals.tax)}</dd></div>}
        <div className="flex justify-between border-t border-line pt-2 text-[18px] font-extrabold tracking-[-0.4px]"><dt>Total due</dt><dd>{f.money(total)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Payment method</dt><dd className="font-bold">{cart.method}</dd></div>
      </dl>

      {isCash && (
        <div className="mt-4">
          <TextField label="Amount received" type="number" inputMode="decimal" min={0} step="any" value={tendered} onChange={(e) => setTendered(e.target.value)} error={tenderError} data-autofocus />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestTenders(total).map((v) => (
              <button key={v} type="button" onClick={() => setTendered(String(v))} className="rounded-full border border-line bg-white px-3 py-1.5 text-[11px] font-bold transition-transform duration-100 hover:bg-[#f8faff] active:scale-95">
                {v === total ? 'Exact' : f.money(v)}
              </button>
            ))}
          </div>
          {!tenderError && <div className="tabular mt-3 flex justify-between rounded-[11px] bg-[#e7f7ef] px-3.5 py-3 text-[13px] font-extrabold text-ok"><span>Change due</span><span>{f.money(changeDue(amount, total))}</span></div>}
        </div>
      )}
      {error && <div className="mt-4"><Notice tone="warn">{error}</Notice></div>}
    </Dialog>
  );
}

function DoneDialog({ sale, open, onNew }: { sale: Sale | null; open: boolean; onNew: () => void }) {
  const { settings } = useStore();
  const { printSale } = usePrint();
  const f = useFormat();
  return (
    <Dialog
      open={open}
      onClose={onNew}
      size="md"
      title="Sale complete"
      footer={
        sale && (
          <>
            <Button onClick={() => printSale(sale)}><Printer size={14} aria-hidden /> Print receipt</Button>
            <Button variant="primary" onClick={onNew} data-autofocus>New sale</Button>
          </>
        )
      }
    >
      {sale && (
        <>
          <div className="mb-4 flex flex-col items-center text-center">
            <div className="check-enter mb-3 grid h-14 w-14 place-items-center rounded-full bg-[#e7f7ef] text-ok"><Check size={28} strokeWidth={3} aria-hidden /></div>
            <div className="tabular text-[26px] font-extrabold tracking-[-0.8px]">{f.money(sale.total)}</div>
            <div className="mt-1 text-xs text-muted">Receipt {sale.receipt} · {sale.method}</div>
            {sale.change !== undefined && sale.change > 0 && <div className="tabular mt-2 rounded-full bg-[#e7f7ef] px-3 py-1 text-xs font-extrabold text-ok">Change due {f.money(sale.change)}</div>}
            <div className="mt-2"><SaleSyncPill sale={sale} /></div>
          </div>
          <Receipt sale={sale} settings={settings} />
        </>
      )}
    </Dialog>
  );
}

function ProductCardMedia({ url, name, tone }: { url?: string; name: string; tone?: string }) {
  const [error, setError] = useState(false);
  const showImg = Boolean(url && !error);

  return (
    <div
      className="mb-3 relative flex h-[78px] w-full items-center justify-center overflow-hidden rounded-xl"
      style={{ background: tone || '#f1f5f9' }}
      aria-hidden
    >
      {showImg ? (
        <img
          src={url}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setError(true)}
        />
      ) : (
        <Package size={30} className="text-[#8896ab]" />
      )}
    </div>
  );
}
