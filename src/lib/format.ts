import { CURRENCIES } from '@/config/constants';
import type { Settings } from '@/types';

export interface Formatters {
  /** ৳1,234.50 */
  money(n: number): string;
  /** ৳1,235 — for big numbers on metric cards. */
  whole(n: number): string;
  number(n: number): string;
  dateTime(iso: string): string;
  date(iso: string): string;
  time(iso: string): string;
  symbol: string;
}

export function makeFormatters(currencyCode: Settings['currencyCode']): Formatters {
  const cur = CURRENCIES.find((c) => c.code === currencyCode) ?? CURRENCIES[0];
  const two = new Intl.NumberFormat(cur.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const zero = new Intl.NumberFormat(cur.locale, { maximumFractionDigits: 0 });
  const plain = new Intl.NumberFormat(cur.locale);
  const dt = new Intl.DateTimeFormat(cur.locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const d = new Intl.DateTimeFormat(cur.locale, { year: 'numeric', month: 'short', day: 'numeric' });
  const t = new Intl.DateTimeFormat(cur.locale, { hour: '2-digit', minute: '2-digit' });
  const signed = (n: number, f: Intl.NumberFormat) => (n < 0 ? '−' : '') + cur.symbol + f.format(Math.abs(n));
  return {
    money: (n) => signed(Number(n) || 0, two),
    whole: (n) => signed(Number(n) || 0, zero),
    number: (n) => plain.format(n),
    dateTime: (iso) => dt.format(new Date(iso)),
    date: (iso) => d.format(new Date(iso)),
    time: (iso) => t.format(new Date(iso)),
    symbol: cur.symbol,
  };
}
