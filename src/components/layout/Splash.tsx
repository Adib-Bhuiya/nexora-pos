'use client';

import { LoaderCircle, TriangleAlert } from 'lucide-react';
import { BRAND } from '@/config/brand';

export function Splash() {
  return (
    <div
      className="fixed inset-0 z-50 flex min-h-dvh flex-col items-center justify-center bg-bg px-4 select-none"
      role="status"
      aria-live="polite"
    >
      <div className="brand-splash-enter flex flex-col items-center text-center">
        {/* Branded Logo with gentle breathing pulse */}
        <div className="relative mb-4">
          <div className="brand-logo-pulse grid h-16 w-16 place-items-center rounded-2xl bg-brand text-[28px] font-black text-white shadow-[0_12px_32px_#315bd638] transition-transform">
            N
          </div>
        </div>

        {/* Brand Name & Tagline matching navbar */}
        <div className="mb-6 leading-tight">
          <div className="text-[21px] font-extrabold tracking-[-0.5px] text-ink">
            <span>{BRAND.name}</span> <span className="text-brand">{BRAND.suffix}</span>
          </div>
          <div className="mt-1 text-[10px] font-extrabold tracking-[1.4px] text-muted uppercase">
            {BRAND.tagline}
          </div>
        </div>

        {/* Elegant loading indicator */}
        <div className="inline-flex items-center gap-2.5 rounded-full border border-line bg-white px-4 py-2 shadow-sm">
          <LoaderCircle size={15} className="animate-spin text-brand" aria-hidden />
          <span className="text-xs font-semibold text-muted">
            Loading {BRAND.name} {BRAND.suffix}…
          </span>
        </div>
      </div>
    </div>
  );
}

export function BootError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-6">
      <div className="max-w-[420px] rounded-[14px] border border-line bg-white p-6 text-center shadow-card" role="alert">
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-[#ffeaec] text-danger">
          <TriangleAlert size={22} />
        </div>
        <h1 className="text-[17px] font-extrabold">Can’t open local storage</h1>
        <p className="mt-2 text-xs text-muted">{message}</p>
        <p className="mt-2 text-xs text-muted">This app keeps all data in your browser’s IndexedDB. Private/incognito windows in some browsers disable it. Try a normal window.</p>
        <button type="button" onClick={onRetry} className="mt-4 rounded-[9px] bg-brand px-4 py-2.5 text-xs font-bold text-white active:scale-[.97]">
          Try again
        </button>
      </div>
    </div>
  );
}
