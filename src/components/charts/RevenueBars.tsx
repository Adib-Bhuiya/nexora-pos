'use client';

import { BarChart3 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PeriodRow } from '@/lib/analytics';
import { useFormat } from '@/hooks/useFormat';

/** Revenue per period. Renders a clean empty state when no sales are recorded. */
export function RevenueBars({ rows, height = 220, label = 'Revenue' }: { rows: PeriodRow[]; height?: number; label?: string }) {
  const f = useFormat();
  const empty = rows.length === 0 || rows.every((r) => r.revenue === 0);
  const dense = rows.length > 14;

  if (empty) {
    return (
      <div
        role="img"
        aria-label={`${label} chart: No sales recorded in this period.`}
        style={{ height }}
        className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-line bg-[#fafbfd] p-6 text-center"
      >
        <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-white text-muted shadow-sm">
          <BarChart3 size={18} aria-hidden />
        </div>
        <p className="text-xs font-bold text-ink">No sales activity</p>
        <p className="mt-1 max-w-[240px] text-[11px] text-muted">
          Revenue trends will appear here once transactions are recorded.
        </p>
      </div>
    );
  }

  return (
    <div role="img" aria-label={`${label} chart. Latest: ${f.money(rows[rows.length - 1]?.revenue ?? 0)}.`} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#edf0f4" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#8b95a5' }} interval={dense ? 'preserveStartEnd' : 0} minTickGap={12} />
          <YAxis width={48} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#8b95a5' }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))} />
          <Tooltip cursor={{ fill: '#f4f6fa' }} formatter={(v) => [f.money(Number(v)), label]} contentStyle={{ borderRadius: 10, border: '1px solid #e7ebf1', fontSize: 12, boxShadow: '0 8px 28px #17203314' }} />
          <Bar dataKey="revenue" radius={[6, 6, 0, 0]} isAnimationActive={false} maxBarSize={44}>
            {rows.map((r, i) => (
              <Cell key={r.key} fill={i === rows.length - 1 ? '#315bd6' : '#dce6ff'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
