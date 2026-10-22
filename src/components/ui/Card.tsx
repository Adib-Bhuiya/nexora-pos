'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-w-0 rounded-[14px] border border-line bg-white shadow-card', className)} {...rest} />;
}

export function CardHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-extrabold tracking-[-0.2px]">{title}</h2>
        {sub && <p className="mt-2 text-xs text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function MetricCard({ label, value, foot, tone }: { label: string; value: ReactNode; foot?: string; tone?: 'warn' | 'danger' }) {
  return (
    <Card className="p-[17px] max-md:p-[13px]">
      <div className="text-xs text-muted truncate">{label}</div>
      <div className={cn('tabular mb-[5px] mt-3 text-[27px] font-extrabold leading-tight tracking-[-1px] max-sm:text-[21px] max-md:text-[23px] truncate', tone === 'warn' && 'text-warn', tone === 'danger' && 'text-danger')}>
        {value}
      </div>
      {foot && <div className="text-[10px] text-muted truncate">{foot}</div>}
    </Card>
  );
}

export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow: string; title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4 max-md:items-start max-sm:flex-col max-sm:items-stretch">
      <div className="min-w-0">
        <div className="mb-[9px] text-[10px] font-extrabold uppercase tracking-[1.3px] text-[#8993a4]">{eyebrow}</div>
        {/* Tight tracking + leading on large type; body stays near 0. */}
        <h1 className="text-[29px] font-extrabold leading-[1.15] tracking-[-1px] max-sm:text-[22px] max-md:text-[25px]">{title}</h1>
        {sub && <p className="mt-2 text-xs text-muted leading-relaxed">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 max-sm:w-full max-sm:flex-wrap max-sm:pt-1">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-[#eef1f6] text-muted">{icon}</div>}
      <div className="text-[13px] font-bold">{title}</div>
      {text && <p className="mt-1.5 max-w-[320px] text-xs text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = 'info', children, icon }: { tone?: 'info' | 'warn'; children: ReactNode; icon?: ReactNode }) {
  return (
    <div className={cn('flex items-start gap-2.5 rounded-[11px] border px-3.5 py-3 text-xs leading-[1.6]', tone === 'warn' ? 'border-[#f3dfb3] bg-[#fff8e8] text-[#7a4f06]' : 'border-[#dbe5ff] bg-brand-soft text-[#2a4aa8]')}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
