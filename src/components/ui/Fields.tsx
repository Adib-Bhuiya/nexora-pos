'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

// 16px on phones prevents iOS from zooming into focused fields; 12px from tablet up (as prototype).
export const fieldClass =
  'block w-full min-w-0 rounded-[9px] border border-[#dfe4ec] bg-white px-3 py-[11px] text-[16px] text-ink md:text-xs ' +
  'placeholder:text-[#a0a8b5] transition-colors duration-100 hover:border-[#c9d1de] ' +
  'disabled:cursor-not-allowed disabled:bg-[#f5f6f8] disabled:text-muted aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(fieldClass, className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...p }, ref) {
  return <select ref={ref} className={cn(fieldClass, className)} {...p} />;
});

interface FieldMeta {
  label: string;
  error?: string;
  hint?: string;
}

function FieldShell({ id, label, error, hint, children, className }: FieldMeta & { id: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} role="alert" className="mt-1.5 text-[11px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="mt-1.5 text-[11px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const TextField = forwardRef<HTMLInputElement, FieldMeta & InputHTMLAttributes<HTMLInputElement>>(function TextField(
  { label, error, hint, className, ...rest },
  ref,
) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className}>
      <Input ref={ref} id={id} aria-invalid={!!error || undefined} aria-describedby={error || hint ? `${id}-msg` : undefined} {...rest} />
    </FieldShell>
  );
});

export function SelectField({ label, error, hint, className, children, ...rest }: FieldMeta & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className}>
      <Select id={id} aria-invalid={!!error || undefined} aria-describedby={error || hint ? `${id}-msg` : undefined} {...rest}>
        {children}
      </Select>
    </FieldShell>
  );
}

export function TextAreaField({ label, error, hint, className, ...rest }: FieldMeta & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className}>
      <textarea id={id} rows={2} className={fieldClass} aria-invalid={!!error || undefined} {...rest} />
    </FieldShell>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-150 disabled:opacity-50', checked ? 'bg-brand' : 'bg-[#cfd6e2]')}
    >
      <span className={cn('absolute left-[2px] top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_3px_#00000030] transition-transform duration-150', checked && 'translate-x-[18px]')} />
    </button>
  );
}

export function SwitchRow({ label, description, checked, onChange, disabled }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-xs font-semibold">{label}</div>
        {description && <div className="mt-0.5 text-[11px] text-muted">{description}</div>}
      </div>
      <Switch label={label} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-[10px] bg-[#eef1f6] p-[3px]', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-[8px] px-3 py-1.5 text-xs font-bold transition-[background-color,color,box-shadow] duration-100',
              active ? 'bg-white text-ink shadow-[0_1px_3px_#17203322]' : 'text-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
