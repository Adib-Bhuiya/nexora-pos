'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { RevenueBars } from '@/components/charts/RevenueBars';
import { SaleDialog, SaleSyncPill } from '@/components/receipt/SaleDialog';
import { buttonClasses } from '@/components/ui/Button';
import { Card, CardHead, EmptyState, MetricCard, PageHeader } from '@/components/ui/Card';
import { StockPill, TableTitle, TableWrap, Td, Th } from '@/components/ui/Bits';
import { useFormat } from '@/hooks/useFormat';
import { dayKey, salesByDay } from '@/lib/analytics';
import { round2, stockStatus } from '@/lib/calc';
import { useStore } from '@/store/StoreProvider';
import type { Sale } from '@/types';

const greeting = (d: Date) => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 18 ? 'Good afternoon' : 'Good evening');

export default function Dashboard() {
  const { products, sales, settings, user, can } = useStore();
  const f = useFormat();
  const [selected, setSelected] = useState<Sale | null>(null);
  const now = new Date();
  const viewAll = can('sales:viewAll');

  // Cashiers see their own numbers only (UI demo — not a security boundary).
  const mine = useMemo(() => (viewAll ? sales : sales.filter((s) => s.cashierId === user.id)), [sales, viewAll, user.id]);
  const today = useMemo(() => mine.filter((s) => dayKey(new Date(s.time)) === dayKey(now)), [mine, now.toDateString()]);
  const revenue = round2(today.reduce((n, s) => n + s.total, 0));
  const week = useMemo(() => salesByDay(mine, 7, now, 'en'), [mine, now.toDateString()]);
  const alerts = products.filter((p) => stockStatus(p.stock, settings.lowStockThreshold) !== 'good').sort((a, b) => a.stock - b.stock);

  return (
    <>
      <PageHeader
        eyebrow={`${settings.storeName} · ${now.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}`}
        title={`${greeting(now)}, ${user.name.split(' ')[0]}.`}
        sub={viewAll ? 'Here’s how the store is doing today.' : 'Here’s how your shift is going today.'}
        actions={
          <Link href="/checkout" className={buttonClasses('primary')}>
            <Plus size={14} aria-hidden /> New sale
          </Link>
        }
      />

      <section aria-label="Today at a glance" className="mb-[18px] grid grid-cols-2 gap-[13px] lg:grid-cols-4 lg:gap-[18px]">
        <MetricCard label={viewAll ? 'Today’s revenue' : 'Your revenue today'} value={f.whole(revenue)} foot={today.length ? `Across ${today.length} sale${today.length === 1 ? '' : 's'}` : 'No sales yet today'} />
        <MetricCard label="Transactions" value={f.number(today.length)} foot="Completed today" />
        <MetricCard label="Active products" value={f.number(products.length)} foot="In the catalog" />
        <MetricCard label="Low stock" value={f.number(alerts.length)} foot={`At or below ${settings.lowStockThreshold} units`} tone={alerts.length ? 'warn' : undefined} />
      </section>

      <section className="mb-[18px] grid gap-[18px] lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
        <Card className="p-[19px] max-md:p-3.5">
          <CardHead title="Sales overview" sub={`Last 7 days · amounts in ${settings.currencyCode}`} />
          <RevenueBars rows={week} />
        </Card>
        <Card className="p-[19px] max-md:p-3.5">
          <CardHead title="Inventory alerts" sub="Products that need attention" right={<Link href="/inventory" className={buttonClasses('secondary', 'sm')}>View</Link>} />
          {alerts.length === 0 ? (
            <EmptyState title="Stock levels look healthy" text="Nothing is at or below the low-stock threshold." />
          ) : (
            <ul className="divide-y divide-[#edf0f4]">
              {alerts.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-[11px]">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold">{p.name}</div>
                    <div className="text-[11px] text-muted">{p.stock} left · {p.sku}</div>
                  </div>
                  <StockPill status={stockStatus(p.stock, settings.lowStockThreshold)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <Card className="overflow-hidden">
        <TableTitle title="Recent transactions" right={<Link href="/sales" className={buttonClasses('secondary', 'sm')}>All sales</Link>} />
        {mine.length === 0 ? (
          <EmptyState title="No sales yet" text="Completed sales will show up here." action={<Link href="/checkout" className={buttonClasses('primary')}>Start a sale</Link>} />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Receipt</Th>
                <Th>Time</Th>
                <Th>Cashier</Th>
                <Th>Payment</Th>
                <Th>Status</Th>
                <Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {mine.slice(0, 6).map((s) => (
                <tr key={s.id} onClick={() => setSelected(s)} className="cursor-pointer transition-colors duration-100 hover:bg-[#fafbfd]">
                  <Td>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setSelected(s); }} className="font-bold text-brand hover:underline">{s.receipt}</button>
                  </Td>
                  <Td>{f.dateTime(s.time)}</Td>
                  <Td>{s.cashierName}</Td>
                  <Td>{s.method}</Td>
                  <Td><SaleSyncPill sale={s} /></Td>
                  <Td align="right" className="font-bold text-ink">{f.money(s.total)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
      <SaleDialog sale={selected} onClose={() => setSelected(null)} />
    </>
  );
}
