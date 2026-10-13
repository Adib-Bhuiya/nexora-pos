'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'secondary' | 'primary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'sm' | 'icon';

const base =
  'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border text-xs font-bold touch-manipulation ' +
  // Feedback is instant on press (active), not on release.
  'transition-[background-color,border-color,transform,opacity] duration-100 active:scale-[.97] disabled:pointer-events-none disabled:opacity-50';
const variants: Record<ButtonVariant, string> = {
  secondary: 'border-line bg-white text-ink hover:bg-[#f8faff]',
  primary: 'border-brand bg-brand text-white hover:bg-brand-dark',
  danger: 'border-[#f1c7cb] bg-white text-danger hover:bg-[#fff5f6]',
  ghost: 'border-transparent bg-transparent text-muted hover:bg-[#eef1f6] hover:text-ink',
};
const sizes: Record<ButtonSize, string> = {
  md: 'px-3 py-[9px] min-h-[36px]',
  sm: 'px-2.5 py-1.5 text-[11px]',
  icon: 'h-9 w-9 p-0',
};

export const buttonClasses = (variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra?: string) =>
  cn(base, variants[variant], sizes[size], extra);

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', size = 'md', loading, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={buttonClasses(variant, size, className)} {...rest}>
      {loading && <LoaderCircle size={14} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
