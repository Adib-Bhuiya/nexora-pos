'use client';

import { LoaderCircle, TriangleAlert } from 'lucide-react';
import { BRAND } from '@/config/brand';

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg">
      <div className="flex flex-col items-center gap-4 text-muted" role="status">
        <div className="grid h-[52px] w-[52px] place-items-center rounded-2xl bg-brand text-[24px] font-extrabold text-white">N</div>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <LoaderCircle size={14} className="animate-spin" aria-hidden /> Opening {BRAND.name} {BRAND.suffix}…
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
