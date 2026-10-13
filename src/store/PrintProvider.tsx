'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Receipt } from '@/components/receipt/Receipt';
import type { Sale } from '@/types';
import { useStore } from './StoreProvider';

interface PrintApi {
  printSale(sale: Sale): void;
}
const Ctx = createContext<PrintApi | null>(null);

export function usePrint(): PrintApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePrint must be used inside <PrintProvider>');
  return v;
}

/**
 * Prints a receipt by rendering it into a hidden #print-root that only shows
 * under @media print (everything else is hidden by CSS in index.css).
 */
export function PrintProvider({ children }: { children: ReactNode }) {
  const { settings } = useStore();
  const [sale, setSale] = useState<Sale | null>(null);

  const printSale = useCallback((s: Sale) => setSale(s), []);

  useEffect(() => {
    if (!sale) return;
    const done = () => setSale(null);
    window.addEventListener('afterprint', done, { once: true });
    // Wait two frames so the receipt is in the DOM before the print dialog opens.
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => window.print());
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      window.removeEventListener('afterprint', done);
    };
  }, [sale]);

  const api = useMemo(() => ({ printSale }), [printSale]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {createPortal(<div id="print-root">{sale && <Receipt sale={sale} settings={settings} forPrint />}</div>, document.body)}
    </Ctx.Provider>
  );
}
