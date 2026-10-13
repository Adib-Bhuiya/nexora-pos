'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useMediaQuery, usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { project, rubberband, springTo, type SpringHandle } from '@/lib/motion';
import { Button } from './Button';

/**
 * Modal dialog. Centered on tablet/desktop, bottom sheet on phones.
 *
 * Motion model: two independent spring values drive the panel —
 *  p (0..1)  presence: opening/closing
 *  d (px)    finger drag offset (sheets only)
 * Springs always start from the current value, so grabbing a sheet mid-open or
 * reopening mid-close never jumps. Releasing a drag hands the finger's velocity
 * to the spring and projects momentum to decide dismiss vs. snap back.
 */
const stack: string[] = [];
let scrollLocks = 0;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function lockScroll() {
  if (scrollLocks++ === 0) {
    const sw = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (sw > 0) document.body.style.paddingRight = `${sw}px`;
  }
}
function unlockScroll() {
  if (--scrollLocks === 0) {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** false = no Esc / scrim / drag / ✕ (use while saving). */
  dismissible?: boolean;
}

const WIDTH = { sm: 'md:max-w-[420px]', md: 'md:max-w-[560px]', lg: 'md:max-w-[780px]' } as const;

export function Dialog({ open, onClose, title, description, children, footer, size = 'md', dismissible = true }: DialogProps) {
  const [mounted, setMounted] = useState(open);
  const render = open || mounted;
  const id = useId();
  const titleId = `${id}-t`;
  const descId = `${id}-d`;

  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const motion = useRef({ p: 0, d: 0 });
  const presence = useRef<SpringHandle | null>(null);
  const dragSpring = useRef<SpringHandle | null>(null);
  const drag = useRef<{ id: number; startY: number; active: boolean; hist: { y: number; t: number }[] } | null>(null);

  const isSheet = useMediaQuery('(max-width: 759.98px)');
  const reduced = usePrefersReducedMotion();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;

  const apply = useCallback(() => {
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    if (!panel || !scrim) return;
    const { p, d } = motion.current;
    const h = panel.offsetHeight || 600;
    if (reduced) {
      // Cross-fade only: no movement.
      panel.style.transform = 'none';
      panel.style.opacity = String(Math.min(1, p));
    } else if (isSheet) {
      panel.style.transform = `translate3d(0,${(1 - p) * h + d}px,0)`;
      panel.style.opacity = '1';
    } else {
      panel.style.transform = `translate3d(0,${(1 - p) * 14}px,0) scale(${0.97 + 0.03 * p})`;
      panel.style.opacity = String(Math.min(1, p * 1.4));
    }
    // Scrim follows both presence and how far the sheet is dragged away.
    scrim.style.opacity = String(Math.max(0, Math.min(1, p)) * (1 - Math.min(1, Math.max(0, d) / h)));
  }, [isSheet, reduced]);

  // Presence spring (open ⇄ close), always from the current value.
  useLayoutEffect(() => {
    if (!render) return;
    if (open) setMounted(true);
    apply();
    if (open && motion.current.d !== 0) {
      dragSpring.current?.cancel();
      dragSpring.current = springTo(motion.current.d, 0, { response: 0.3, damping: 1, restDelta: 0.5, restSpeed: 10 }, (v) => {
        motion.current.d = v;
        apply();
      });
    }
    const h = springTo(
      motion.current.p,
      open ? 1 : 0,
      { response: reduced ? 0.14 : 0.38, damping: 1 },
      (v) => {
        motion.current.p = v;
        apply();
      },
      () => {
        if (!open) {
          motion.current.d = 0;
          setMounted(false);
        }
      },
    );
    presence.current = h;
    return () => h.cancel();
  }, [open, render, reduced, apply]);

  // Focus management, Esc, Tab trap, scroll lock, stacking.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    stack.push(id);
    lockScroll();
    const t = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target =
        panel.querySelector<HTMLElement>('[data-autofocus]') ??
        panel.querySelector<HTMLElement>(`[data-dialog-body] :is(input,select,textarea):not([disabled])`) ??
        panel;
      target.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return; // only the top-most dialog reacts
      if (e.key === 'Escape' && dismissibleRef.current) {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const f = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (f.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const first = f[0];
        const last = f[f.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === panel)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(t);
      document.removeEventListener('keydown', onKey);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      unlockScroll();
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, id]);

  // ---- sheet drag (phones) ----
  const canDrag = isSheet && dismissible && !reduced;
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!canDrag || e.button > 0) return;
    if ((e.target as HTMLElement).closest('button,a,input,select,textarea')) return;
    drag.current = { id: e.pointerId, startY: e.clientY, active: false, hist: [{ y: e.clientY, t: e.timeStamp }] };
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    const dy = e.clientY - g.startY;
    if (!g.active) {
      if (Math.abs(dy) < 10) return; // hysteresis before committing to a drag
      g.active = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragSpring.current?.cancel();
    }
    g.hist.push({ y: e.clientY, t: e.timeStamp });
    while (g.hist.length > 2 && e.timeStamp - g.hist[0].t > 100) g.hist.shift();
    const h = panelRef.current?.offsetHeight ?? 600;
    const raw = dy - Math.sign(dy) * 10;
    motion.current.d = raw >= 0 ? raw : -rubberband(-raw, h); // 1:1 down, resist upward
    apply();
  };
  const endDrag = (e: RPointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    drag.current = null;
    if (!g.active) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const first = g.hist[0];
    const last = g.hist[g.hist.length - 1];
    const v = ((last.y - first.y) / Math.max(1, last.t - first.t)) * 1000; // px/s, +down
    const h = panelRef.current?.offsetHeight ?? 600;
    const d = motion.current.d;
    const dismiss = e.type !== 'pointercancel' && d + project(v) > h * 0.5;
    dragSpring.current?.cancel();
    if (dismiss) {
      dragSpring.current = springTo(d, h, { response: 0.32, damping: 1, velocity: v, restDelta: 1, restSpeed: 30 }, (val) => {
        motion.current.d = val;
        apply();
      }, () => onCloseRef.current());
    } else {
      // Bounce only when the release carried momentum.
      dragSpring.current = springTo(d, 0, { response: 0.3, damping: Math.abs(v) > 300 ? 0.8 : 1, velocity: v, restDelta: 0.5, restSpeed: 10 }, (val) => {
        motion.current.d = val;
        apply();
      });
    }
  };

  if (!render) return null;

  return createPortal(
    <div data-overlay className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div ref={scrimRef} className="absolute inset-0 bg-[#0f1729]/45" style={{ opacity: 0 }} onClick={dismissible ? onClose : undefined} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        style={{ opacity: 0, willChange: 'transform, opacity' }}
        className={cn(
          'relative flex w-full flex-col bg-white outline-none shadow-[0_24px_64px_#17203333]',
          'max-h-[calc(100dvh-20px)] rounded-t-[22px] md:max-h-[min(88dvh,820px)] md:rounded-2xl',
          WIDTH[size],
        )}
      >
        <div
          className="shrink-0 touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-[#d5dbe6] md:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-4 md:pt-5">
            <div className="min-w-0">
              <h2 id={titleId} className="text-[17px] font-extrabold leading-tight tracking-[-0.3px]">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-xs text-muted">
                  {description}
                </p>
              )}
            </div>
            {dismissible && (
              <button type="button" aria-label="Close dialog" onClick={onClose} className="-mr-1.5 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors duration-100 hover:bg-[#eef1f6] hover:text-ink active:scale-95">
                <X size={18} />
              </button>
            )}
          </div>
        </div>
        <div data-dialog-body className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5', footer ? 'pb-4' : 'pb-[max(20px,env(safe-area-inset-bottom))]')}>
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-3.5">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'primary',
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          {/* Focus lands on the safe choice. */}
          <Button data-autofocus onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={busy} className={tone === 'danger' ? '!border-danger !bg-danger !text-white hover:!bg-[#a52f3a]' : ''}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[13px] leading-[1.6] text-[#394356]">{message}</div>
    </Dialog>
  );
}
