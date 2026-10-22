'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import { RevenueBars } from '@/components/charts/RevenueBars';
import { Button } from '@/components/ui/Button';
import { Card, CardHead, EmptyState, MetricCard, PageHeader } from '@/components/ui/Card';
import { Segmented, Select } from '@/components/ui/Fields';
import { StockPill, TableTitle, TableWrap, Td, Th } from '@/components/ui/Bits';
import { PAYMENT_METHODS } from '@/config/constants';
import { useFormat } from '@/hooks/useFormat';
import { bestSellers, inventoryReport, paymentBreakdown, salesByDay, salesByMonth, sumRows } from '@/lib/analytics';
import { stockStatus } from '@/lib/calc';
import { downloadCsv } from '@/lib/csv';
import { useStore } from '@/store/StoreProvider';

type Mode = 'daily' | 'monthly';

export default function Reports() {
  const { sales, products, settings } = useStore();
  const f = useFormat();
  const [mode, setMode] = useState<Mode>('daily');
  const [span, setSpan] = useState({ daily: 14, monthly: 6 });
  const count = span[mode];

  const now = new Date();
  const rows = useMemo(
    () => (mode === 'daily' ? salesByDay(sales, count, now, 'en') : salesByMonth(sales, count, now, 'en')),
    [sales, mode, count, now.toDateString()],
  );
  const totals = sumRows(rows);
  const keys = new Set(rows.map((r) => r.key));
  const inPeriod = useMemo(
    () =>
      sales.filter((s) => {
        const d = new Date(s.time);
        const key = mode === 'daily' ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return keys.has(key);
      }),
    [sales, rows],
  );
  const top = useMemo(() => bestSellers(inPeriod, 8), [inPeriod]);
  const pay = useMemo(() => paymentBreakdown(inPeriod, PAYMENT_METHODS), [inPeriod]);
  const inv = useMemo(() => inventoryReport(products, settings.lowStockThreshold), [products, settings.lowStockThreshold]);
  const periodWord = mode === 'daily' ? `${count} days` : `${count} months`;

  const exportSummary = () =>
    downloadCsv(`sales-${mode}.csv`, [
      [mode === 'daily' ? 'Day' : 'Month', 'Orders', 'Units', 'Revenue', 'Discounts', 'Tax', 'Gross profit'],
      ...rows.map((r) => [r.label, r.orders, r.units, r.revenue, r.discount, r.tax, r.profit]),
    ]);
  const exportInventory = () =>
    downloadCsv('inventory-report.csv', [
      ['Product', 'SKU', 'Category', 'On hand', 'Unit cost', 'Price', 'Stock value (cost)', 'Status'],
      ...products.map((p) => [p.name, p.sku, p.category, p.stock, p.cost, p.price, p.cost * p.stock, stockStatus(p.stock, settings.lowStockThreshold)]),
    ]);

  return (
    <>
      <PageHeader
        eyebrow="ANALYTICS"
        title="Reports"
        sub={`Last ${periodWord} · profit uses each product’s recorded cost`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Period length" value={count} onChange={(e) => setSpan((s) => ({ ...s, [mode]: Number(e.target.value) }))} className="!w-auto">
              {(mode === 'daily' ? [7, 14, 30] : [3, 6, 12]).map((n) => <option key={n} value={n}>Last {n} {mode === 'daily' ? 'days' : 'months'}</option>)}
            </Select>
            <Segmented<Mode> label="Report period" value={mode} onChange={setMode} options={[{ value: 'daily', label: 'Daily' }, { value: 'monthly', label: 'Monthly' }]} />
          </div>
        }
      />

      <section aria-label="Period summary" className="mb-[18px] grid grid-cols-2 gap-[13px] lg:grid-cols-4 lg:gap-[18px]">
        <MetricCard label="Revenue" value={f.whole(totals.revenue)} foot={`${totals.orders} orders`} />
        <MetricCard label="Average sale" value={f.whole(totals.orders ? totals.revenue / totals.orders : 0)} foot={`${totals.units} units sold`} />
        <MetricCard label="Gross profit" value={f.whole(totals.profit)} foot={totals.revenue ? `${Math.round((totals.profit / (totals.revenue - totals.tax || 1)) * 100)}% margin` : '—'} />
        <MetricCard label="Discounts given" value={f.whole(totals.discount)} foot={settings.taxEnabled ? `${settings.taxLabel} collected ${f.whole(totals.tax)}` : 'Tax not enabled'} />
      </section>

      <section className="mb-[18px] grid gap-[18px] lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
        <Card className="p-[19px] max-md:p-3.5">
          <CardHead title={mode === 'daily' ? 'Daily revenue' : 'Monthly revenue'} sub={`Amounts in ${settings.currencyCode}`} />
          <RevenueBars rows={rows} height={260} />
        </Card>
        <Card className="p-[19px] max-md:p-3.5">
          <CardHead title="Payment methods" sub={`Share of revenue, last ${periodWord}`} />
          {totals.orders === 0 ? (
            <EmptyState title="No sales in this period" text="Payment breakdown by method will appear as sales are recorded." />
          ) : (
            <div className="space-y-4">
              {pay.map((p) => (
                <div key={p.method}>
                  <div className="tabular mb-1.5 flex justify-between text-xs"><span className="font-semibold">{p.method}</span><span className="text-muted">{f.money(p.total)} · {Math.round(p.share * 100)}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#eef1f6]" role="img" aria-label={`${p.method}: ${Math.round(p.share * 100)} percent`}>
                    <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(p.share * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="mb-[18px] grid gap-[18px] lg:grid-cols-2">
        <Card className="p-[19px] max-md:p-3.5">
          <CardHead title="Best-selling products" sub="By units sold" />
          {top.length === 0 ? (
            <EmptyState title="No sales in this period" text="Top products by units sold will be ranked here." />
          ) : (
            <>
              <div role="img" aria-label={`Top seller: ${top[0].name}, ${top[0].units} units`} style={{ height: Math.max(180, top.length * 34) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={top} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid horizontal={false} stroke="#edf0f4" />
                    <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#8b95a5' }} />
                    <YAxis type="category" dataKey="name" width={118} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#394356' }} />
                    <Tooltip cursor={{ fill: '#f4f6fa' }} formatter={(v) => [`${v} units`, 'Sold']} contentStyle={{ borderRadius: 10, border: '1px solid #e7ebf1', fontSize: 12 }} />
                    <Bar dataKey="units" radius={[0, 6, 6, 0]} isAnimationActive={false} barSize={18}>
                      {top.map((t, i) => <Cell key={t.productId} fill={i === 0 ? '#315bd6' : '#b9ccff'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </Card>
        <Card className="overflow-hidden">
          <TableTitle title="Top products" />
          {top.length === 0 ? <EmptyState title="Nothing to rank yet" text="Product sales rankings will appear once items are purchased." /> : (
            <TableWrap>
              <thead><tr><Th>#</Th><Th>Product</Th><Th align="right">Units</Th><Th align="right">Revenue</Th><Th align="right">Profit</Th></tr></thead>
              <tbody>
                {top.map((t, i) => (
                  <tr key={t.productId}><Td>{i + 1}</Td><Td className="font-bold text-ink">{t.name}</Td><Td align="right">{t.units}</Td><Td align="right">{f.money(t.revenue)}</Td><Td align="right">{f.money(t.profit)}</Td></tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </section>

      <Card className="mb-[18px] overflow-hidden">
        <TableTitle title={mode === 'daily' ? 'Daily summary' : 'Monthly summary'} right={<Button size="sm" onClick={exportSummary} disabled={totals.orders === 0}><Download size={13} aria-hidden /> CSV</Button>} />
        {totals.orders === 0 ? (
          <EmptyState title="No transactions recorded" text="Daily order and revenue summaries will appear here once sales are completed." />
        ) : (
          <TableWrap>
            <thead><tr><Th>{mode === 'daily' ? 'Day' : 'Month'}</Th><Th align="right">Orders</Th><Th align="right">Units</Th><Th align="right">Revenue</Th><Th align="right">Discounts</Th><Th align="right">Tax</Th><Th align="right">Gross profit</Th></tr></thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.key}><Td className="font-bold text-ink">{r.label}</Td><Td align="right">{r.orders}</Td><Td align="right">{r.units}</Td><Td align="right" className="font-bold text-ink">{f.money(r.revenue)}</Td><Td align="right">{f.money(r.discount)}</Td><Td align="right">{f.money(r.tax)}</Td><Td align="right">{f.money(r.profit)}</Td></tr>
              ))}
              <tr className="bg-[#fafbfd] font-extrabold"><Td className="text-ink">Total</Td><Td align="right">{totals.orders}</Td><Td align="right">{totals.units}</Td><Td align="right" className="text-ink">{f.money(totals.revenue)}</Td><Td align="right">{f.money(totals.discount)}</Td><Td align="right">{f.money(totals.tax)}</Td><Td align="right">{f.money(totals.profit)}</Td></tr>
            </tbody>
          </TableWrap>
        )}
      </Card>

      <section aria-label="Inventory report" className="grid gap-[18px] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="p-[19px] max-md:p-3.5">
          <CardHead title="Inventory report" sub="Value of stock on hand" right={<Button size="sm" onClick={exportInventory} disabled={products.length === 0}><Download size={13} aria-hidden /> CSV</Button>} />
          <dl className="tabular space-y-2.5 text-xs">
            {[['Products', f.number(inv.products)], ['Units on hand', f.number(inv.units)], ['Stock value at cost', f.money(inv.costValue)], ['Stock value at retail', f.money(inv.retailValue)], ['Potential gross profit', f.money(inv.potentialProfit)]].map(([l, v]) => (
              <div key={l} className="flex justify-between border-b border-[#edf0f4] pb-2.5 last:border-0"><dt className="text-muted">{l}</dt><dd className="font-extrabold">{v}</dd></div>
            ))}
          </dl>
        </Card>
        <Card className="overflow-hidden">
          <TableTitle title="Needs restocking" />
          {inv.low.length + inv.out.length === 0 ? (
            <EmptyState
              title={products.length === 0 ? 'No products registered' : 'Nothing needs restocking'}
              text={products.length === 0 ? 'Add products to track inventory and restocking thresholds.' : 'All products are above the low-stock threshold.'}
            />
          ) : (
            <TableWrap>
              <thead><tr><Th>Product</Th><Th align="right">On hand</Th><Th>Status</Th></tr></thead>
              <tbody>
                {[...inv.out, ...inv.low].map((p) => (
                  <tr key={p.id}><Td className="font-bold text-ink">{p.name}</Td><Td align="right">{p.stock}</Td><Td><StockPill status={stockStatus(p.stock, settings.lowStockThreshold)} /></Td></tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </section>
    </>
  );
}
