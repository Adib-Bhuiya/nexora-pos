'use client';

import { useState } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Segmented } from '@/components/ui/Fields';
import { StatusPill, TableWrap, Td, Th } from '@/components/ui/Bits';
import { useFormat } from '@/hooks/useFormat';
import { useStore } from '@/store/StoreProvider';
import { usePrint } from '@/store/PrintProvider';
import type { Sale } from '@/types';
import { Receipt } from './Receipt';

export function SaleSyncPill({ sale }: { sale: Sale }) {
  return <StatusPill tone={sale.syncStatus === 'synced' ? 'good' : 'low'}>{sale.syncStatus === 'synced' ? 'Synced (demo)' : 'Pending sync'}</StatusPill>;
}

/** Sale details with a switch to the printable receipt. */
export function SaleDialog({ sale, onClose, initialView = 'details' }: { sale: Sale | null; onClose: () => void; initialView?: 'details' | 'receipt' }) {
  const { settings, can } = useStore();
  const f = useFormat();
  const { printSale } = usePrint();
  const [view, setView] = useState<'details' | 'receipt'>(initialView);
  // Keep the last sale mounted while the close animation plays.
  const [last, setLast] = useState<Sale | null>(sale);
  if (sale && sale !== last) setLast(sale);
  const s = sale ?? last;
  const showCost = can('costs:view');

  return (
    <Dialog
      open={!!sale}
      onClose={onClose}
      size="md"
      title={s ? `Sale ${s.receipt}` : 'Sale'}
      description={s ? `${f.dateTime(s.time)} · ${s.cashierName}` : undefined}
      footer={
        s && (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={() => printSale(s)}>
              <Printer size={14} aria-hidden /> Print receipt
            </Button>
          </>
        )
      }
    >
      {s && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <Segmented<'details' | 'receipt'> label="View" value={view} onChange={setView} options={[{ value: 'details', label: 'Details' }, { value: 'receipt', label: 'Receipt' }]} />
            <SaleSyncPill sale={s} />
          </div>
          {view === 'receipt' ? (
            <Receipt sale={s} settings={settings} />
          ) : (
            <>
              <div className="overflow-hidden rounded-[11px] border border-line">
                <TableWrap>
                  <thead>
                    <tr>
                      <Th className="!border-t-0">Item</Th>
                      <Th align="right" className="!border-t-0">Qty</Th>
                      <Th align="right" className="!border-t-0">Price</Th>
                      <Th align="right" className="!border-t-0">Total</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.items.map((i) => (
                      <tr key={i.productId}>
                        <Td>
                          <div className="font-semibold text-ink">{i.name}</div>
                          <div className="text-[10px] text-muted">{i.sku}</div>
                        </Td>
                        <Td align="right">{i.qty}</Td>
                        <Td align="right">{f.money(i.price)}</Td>
                        <Td align="right" className="font-bold text-ink">{f.money(i.price * i.qty)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </div>
              <dl className="tabular mt-4 space-y-1.5 text-xs">
                <Line l="Subtotal" r={f.money(s.subtotal)} />
                {s.discount > 0 && <Line l={s.discountType === 'percent' ? `Discount (${s.discountValue}%)` : 'Discount'} r={`−${f.money(s.discount)}`} />}
                {s.tax > 0 && <Line l={`${s.taxLabel} (${s.taxRate}%${s.taxInclusive ? ', included' : ''})`} r={f.money(s.tax)} />}
                <div className="flex justify-between border-t border-line pt-2 text-[15px] font-extrabold">
                  <dt>Total</dt>
                  <dd>{f.money(s.total)}</dd>
                </div>
                <Line l="Payment" r={s.method} />
                {s.tendered !== undefined && <Line l="Received" r={f.money(s.tendered)} />}
                {s.change !== undefined && <Line l="Change" r={f.money(s.change)} />}
                <Line l="Transaction ID" r={s.id} />
                {showCost && <Line l="Gross profit" r={f.money(s.total - s.tax - s.items.reduce((n, i) => n + i.cost * i.qty, 0))} />}
              </dl>
            </>
          )}
        </>
      )}
    </Dialog>
  );
}

const Line = ({ l, r }: { l: string; r: string }) => (
  <div className="flex justify-between gap-4 text-[#394356]">
    <dt className="text-muted">{l}</dt>
    <dd className="text-right font-semibold">{r}</dd>
  </div>
);
