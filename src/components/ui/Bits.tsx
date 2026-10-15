'use client';
import { Package } from 'lucide-react';
import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import type { StockStatus } from '@/types';
import { cn } from '@/lib/cn';

type Tone = 'good' | 'low' | 'out' | 'info' | 'neutral';
const TONES: Record<Tone, string> = {
  good: 'bg-[#e7f7ef] text-[#137955]',
  low: 'bg-[#fff3dd] text-[#9c6205]',
  out: 'bg-[#ffeaec] text-[#b62f3c]',
  info: 'bg-brand-soft text-brand',
  neutral: 'bg-[#eef1f6] text-[#667186]',
};

export function StatusPill({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-extrabold', TONES[tone], className)}>{children}</span>;
}

const STOCK_LABEL: Record<StockStatus, string> = { good: 'In stock', low: 'Low stock', out: 'Out of stock' };
export const StockPill = ({ status }: { status: StockStatus }) => <StatusPill tone={status}>{STOCK_LABEL[status]}</StatusPill>;


export function ProductThumb({
  imageUrl,
  tone,
  size = 37,
}: {
  imageUrl: string;
  tone: string;
  size?: number;
}) {
  return (
    <div
      className="grid shrink-0 place-items-center overflow-hidden rounded-[10px]"
      style={{
        width: size,
        height: size,
        background: tone || '#f3f4f6',
      }}
    >
      {imageUrl?.trim() ? (
        <img
          src={imageUrl.trim()}
          alt="Product"
          className="h-full w-full object-cover"
        />
      ) : (
        <Package
          size={size * 0.45}
          className="text-gray-400"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export function Avatar({ initials, size = 36, title }: { initials: string; size?: number; title?: string }) {
  return (
    <div title={title} className="grid shrink-0 place-items-center rounded-full bg-[#e5edff] text-[12px] font-extrabold text-[#244bc0]" style={{ width: size, height: size }}>
      {initials}
    </div>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse whitespace-nowrap text-left">{children}</table>
    </div>
  );
}
export function Th({ className, align, ...p }: ThHTMLAttributes<HTMLTableCellElement> & { align?: 'right' }) {
  return <th scope="col" className={cn('border-t border-[#edf0f4] bg-[#fafbfd] px-4 py-[13px] text-[10px] font-extrabold uppercase tracking-[.8px] text-[#8b95a5]', align === 'right' && 'text-right', className)} {...p} />;
}
export function Td({ className, align, ...p }: TdHTMLAttributes<HTMLTableCellElement> & { align?: 'right' }) {
  return <td className={cn('border-t border-[#edf0f4] px-4 py-[13px] text-xs text-[#394356]', align === 'right' && 'text-right', className)} {...p} />;
}
export function TableTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2.5 px-[19px] py-[17px] max-md:px-3.5 max-md:py-3.5">
      <h2 className="text-[15px] font-extrabold tracking-[-0.2px]">{title}</h2>
      {right}
    </div>
  );
}
