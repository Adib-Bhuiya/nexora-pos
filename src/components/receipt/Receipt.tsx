'use client';

import { makeFormatters } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Sale, Settings } from '@/types';

/** Printable receipt. Used for on-screen preview and (forPrint) the hidden print root. */
export function Receipt({ sale, settings, forPrint }: { sale: Sale; settings: Settings; forPrint?: boolean }) {
  const f = makeFormatters(settings.currencyCode);
  const width = settings.receiptPaper === '58mm' ? '58mm' : '80mm';
  const Row = ({ l, r, bold }: { l: string; r: string; bold?: boolean }) => (
    <div className={cn('flex justify-between gap-3', bold && 'text-[14px] font-bold')}>
      <span>{l}</span>
      <span className="tabular">{r}</span>
    </div>
  );
  return (
    <div
      className={cn('mx-auto bg-white font-mono text-[11px] leading-[1.5] text-black', !forPrint && 'rounded-lg border border-line p-4')}
      style={{ width: forPrint ? width : `min(100%, ${width === '58mm' ? '300px' : '360px'})` }}
      data-testid="receipt"
    >
      <div className="text-center">
        <div className="text-[15px] font-bold">{settings.storeName}</div>
        {settings.address && <div>{settings.address}</div>}
        {settings.phone && <div>{settings.phone}</div>}
        {settings.email && <div>{settings.email}</div>}
        {settings.receiptShowTaxId && settings.taxId && <div>Tax ID: {settings.taxId}</div>}
        {settings.receiptHeader && <div className="mt-1">{settings.receiptHeader}</div>}
      </div>
      <hr className="my-2 border-dashed border-black/50" />
      <div>
        <Row l="Receipt" r={sale.receipt} />
        <Row l="Date" r={f.dateTime(sale.time)} />
        {settings.receiptShowCashier && <Row l="Cashier" r={sale.cashierName} />}
      </div>
      <hr className="my-2 border-dashed border-black/50" />
      <div className="space-y-1.5">
        {sale.items.map((i) => (
          <div key={i.productId}>
            <div className="break-words">{i.name}</div>
            <Row l={`  ${i.qty} × ${f.money(i.price)}`} r={f.money(i.qty * i.price)} />
          </div>
        ))}
      </div>
      <hr className="my-2 border-dashed border-black/50" />
      <Row l="Subtotal" r={f.money(sale.subtotal)} />
      {sale.discount > 0 && <Row l={sale.discountType === 'percent' ? `Discount (${sale.discountValue}%)` : 'Discount'} r={`−${f.money(sale.discount)}`} />}
      {sale.tax > 0 && <Row l={`${sale.taxLabel} ${sale.taxRate}%${sale.taxInclusive ? ' (incl.)' : ''}`} r={f.money(sale.tax)} />}
      <hr className="my-1.5 border-black/60" />
      <Row l="TOTAL" r={f.money(sale.total)} bold />
      <div className="mt-1">
        <Row l="Payment" r={sale.method} />
        {sale.tendered !== undefined && <Row l="Received" r={f.money(sale.tendered)} />}
        {sale.change !== undefined && <Row l="Change" r={f.money(sale.change)} />}
      </div>
      <hr className="my-2 border-dashed border-black/50" />
      <div className="text-center">
        {settings.receiptFooter && <div>{settings.receiptFooter}</div>}
        <div className="mt-1 break-all text-[10px]">Transaction ID: {sale.id}</div>
      </div>
    </div>
  );
}
