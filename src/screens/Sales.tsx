'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Download, Receipt as ReceiptIcon, Search } from 'lucide-react';
import { SaleDialog, SaleSyncPill } from '@/components/receipt/SaleDialog';
import { Button } from '@/components/ui/Button';
import { Card, EmptyState, PageHeader } from '@/components/ui/Card';
import { Input, Segmented, Select } from '@/components/ui/Fields';
import { StatusPill, TableWrap, Td, Th } from '@/components/ui/Bits';
import { PAYMENT_METHODS } from '@/config/constants';
import { useFormat } from '@/hooks/useFormat';
import { startOfDay } from '@/lib/analytics';
import { round2 } from '@/lib/calc';
import { downloadCsv } from '@/lib/csv';
import { useStore } from '@/store/StoreProvider';
import type { PaymentMethod, SyncStatus } from '@/types';

type Preset = 'today' | '7d' | '30d' | 'all' | 'custom';
const PAGE = 50;

const toInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function Sales() {
  const { sales, user, can } = useStore();
  const f = useFormat();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openSale = (id: string) => router.push(`${pathname}?sale=${encodeURIComponent(id)}`, { scroll: false });
  const viewAll = can('sales:viewAll');

  const [query, setQuery] = useState('');
  const [preset, setPreset] = useState<Preset>('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [method, setMethod] = useState<'all' | PaymentMethod>('all');
  const [sync, setSync] = useState<'all' | SyncStatus>('all');
  const [shown, setShown] = useState(PAGE);

  const mine = useMemo(() => (viewAll ? sales : sales.filter((s) => s.cashierId === user.id)), [sales, viewAll, user.id]);

  const range = useMemo<[number, number]>(() => {
    const today = startOfDay(new Date()).getTime();
    const day = 86_400_000;
    switch (preset) {
      case 'today': return [today, Infinity];
      case '7d': return [today - 6 * day, Infinity];
      case '30d': return [today - 29 * day, Infinity];
      case 'custom': return [from ? new Date(from + 'T00:00:00').getTime() : -Infinity, to ? new Date(to + 'T23:59:59.999').getTime() : Infinity];
      default: return [-Infinity, Infinity];
    }
  }, [preset, from, to]);

  const q = query.trim().toLowerCase();
  const rows = mine.filter((s) => {
    const t = Date.parse(s.time);
    return (
      t >= range[0] && t <= range[1] &&
      (method === 'all' || s.method === method) &&
      (sync === 'all' || s.syncStatus === sync) &&
      (!q || s.receipt.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.cashierName.toLowerCase().includes(q) || s.items.some((i) => i.name.toLowerCase().includes(q)))
    );
  });
  const total = round2(rows.reduce((n, s) => n + s.total, 0));
  const customInvalid = preset === 'custom' && from && to && from > to;

  // Deep link from the dashboard: /sales?sale=<id>
  const openId = params.get('sale');
  const selected = openId ? mine.find((s) => s.id === openId) ?? null : null;
  useEffect(() => setShown(PAGE), [query, preset, from, to, method, sync]);

  const exportCsv = () =>
    downloadCsv(`sales-${toInput(new Date())}.csv`, [
      ['Receipt', 'Transaction ID', 'Date', 'Cashier', 'Payment', 'Items', 'Subtotal', 'Discount', 'Tax', 'Total', 'Sync'],
      ...rows.map((s) => [s.receipt, s.id, s.time, s.cashierName, s.method, s.items.reduce((n, i) => n + i.qty, 0), s.subtotal, s.discount, s.tax, s.total, s.syncStatus]),
    ]);

  return (
    <>
      <PageHeader
        eyebrow="TRANSACTIONS"
        title="Sales history"
        sub={viewAll ? 'Every completed sale on this device.' : 'Showing your sales only.'}
        actions={<Button onClick={exportCsv} disabled={rows.length === 0}><Download size={14} aria-hidden /> Export CSV</Button>}
      />

      <Card className="overflow-hidden">
        <div className="space-y-2.5 p-3.5 md:p-[19px]">
          <div className="flex gap-2.5 max-md:flex-col">
            <div className="relative flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa3b2]" aria-hidden />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search receipt, transaction, cashier or product…" aria-label="Search sales" className="pl-9" />
            </div>
            <Select value={method} onChange={(e) => setMethod(e.target.value as 'all' | PaymentMethod)} aria-label="Filter by payment method" className="md:max-w-[200px]">
              <option value="all">All payment methods</option>
              {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
            </Select>
            <Select value={sync} onChange={(e) => setSync(e.target.value as 'all' | SyncStatus)} aria-label="Filter by sync status" className="md:max-w-[170px]">
              <option value="all">Any sync status</option>
              <option value="pending">Pending sync</option>
              <option value="synced">Synced</option>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="max-w-full overflow-x-auto">
              <Segmented<Preset> label="Date range" value={preset} onChange={setPreset} options={[{ value: 'today', label: 'Today' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: 'all', label: 'All' }, { value: 'custom', label: 'Custom' }]} />
            </div>
            {preset === 'custom' && (
              <div className="flex items-center gap-2">
                <Input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="!w-auto" />
                <span className="text-xs text-muted">to</span>
                <Input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="!w-auto" />
              </div>
            )}
            <span className="tabular ml-auto text-xs text-muted">{rows.length} sale{rows.length === 1 ? '' : 's'} · <b className="text-ink">{f.money(total)}</b></span>
          </div>
          {customInvalid && <p role="alert" className="text-[11px] text-danger">The start date is after the end date.</p>}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<ReceiptIcon size={20} />}
            title={mine.length ? 'No sales match these filters' : 'No transactions recorded'}
            text={mine.length ? 'Try widening the date range or clearing filters.' : 'Completed sales will be listed here.'}
          />
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr><Th>Receipt</Th><Th>Date</Th><Th>Cashier</Th><Th align="right">Items</Th><Th>Payment</Th><Th>Status</Th><Th align="right">Total</Th></tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map((s) => (
                  <tr key={s.id} onClick={() => openSale(s.id)} className="cursor-pointer transition-colors duration-100 hover:bg-[#fafbfd]">
                    <Td><button type="button" onClick={(e) => { e.stopPropagation(); openSale(s.id); }} className="font-bold text-brand hover:underline">{s.receipt}</button></Td>
                    <Td>{f.dateTime(s.time)}</Td>
                    <Td>{s.cashierName}</Td>
                    <Td align="right">{s.items.reduce((n, i) => n + i.qty, 0)}</Td>
                    <Td><StatusPill>{s.method}</StatusPill></Td>
                    <Td><SaleSyncPill sale={s} /></Td>
                    <Td align="right" className="font-bold text-ink">{f.money(s.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <div className="flex items-center justify-between border-t border-[#edf0f4] px-4 py-3 text-xs text-muted">
              <span>Showing {Math.min(shown, rows.length)} of {rows.length}</span>
              {shown < rows.length && <Button size="sm" onClick={() => setShown((n) => n + PAGE)}>Show more</Button>}
            </div>
          </>
        )}
      </Card>

      <SaleDialog sale={selected} onClose={() => router.replace(pathname, { scroll: false })} />
    </>
  );
}
