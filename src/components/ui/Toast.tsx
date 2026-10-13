'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, CircleX, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
  duration: number;
}
interface NotifyOptions {
  tone?: ToastTone;
  action?: ToastItem['action'];
  duration?: number;
}
interface ToastApi {
  notify: (message: string, options?: NotifyOptions) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>');
  return v;
}

const ICON = { info: Info, success: CircleCheck, warning: CircleAlert, error: CircleX } as const;
const ICON_COLOR = { info: 'text-[#9db8ff]', success: 'text-[#5fd3a4]', warning: 'text-[#ffc56b]', error: 'text-[#ff8d97]' } as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const notify = useCallback<ToastApi['notify']>((message, o = {}) => {
    const tone = o.tone ?? 'info';
    const id = nextId.current++;
    const duration = o.duration ?? (tone === 'error' ? 6000 : o.action ? 7000 : 3600);
    // De-duplicate identical messages, keep at most 3 on screen.
    setItems((l) => [...l.filter((t) => t.message !== message), { id, message, tone, action: o.action, duration }].slice(-3));
  }, []);

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        data-overlay
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-[22px] right-[22px] z-[60] flex flex-col gap-2 max-md:bottom-auto max-md:left-3 max-md:right-3 max-md:top-[calc(10px+env(safe-area-inset-top))]"
      >
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const Icon = ICON[item.tone];
  useEffect(() => {
    const t = setTimeout(() => onDismiss(item.id), item.duration);
    return () => clearTimeout(t);
  }, [item, onDismiss]);
  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      className="toast-enter pointer-events-auto flex max-w-[360px] items-start gap-2.5 rounded-[11px] bg-[#182238] px-4 py-[13px] text-xs text-white shadow-[0_8px_28px_#17203325] max-md:max-w-none"
    >
      <Icon size={16} className={cn('mt-[1px] shrink-0', ICON_COLOR[item.tone])} aria-hidden />
      <span className="min-w-0 flex-1 leading-[1.5]">{item.message}</span>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            onDismiss(item.id);
          }}
          className="shrink-0 rounded-md px-1.5 font-bold text-[#9db8ff] hover:text-white"
        >
          {item.action.label}
        </button>
      )}
      <button type="button" aria-label="Dismiss notification" onClick={() => onDismiss(item.id)} className="shrink-0 rounded-md p-0.5 text-white/60 hover:text-white">
        <X size={14} />
      </button>
    </div>
  );
}
