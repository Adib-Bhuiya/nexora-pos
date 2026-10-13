'use client';

import { useEffect, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import { initServiceWorker } from '@/hooks/useServiceWorker';
import { CartProvider } from '@/store/CartProvider';
import { PrintProvider } from '@/store/PrintProvider';
import { StoreProvider } from '@/store/StoreProvider';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    initServiceWorker(); // production builds only
  }, []);

  return (
    <ToastProvider>
      <StoreProvider>
        <CartProvider>
          <PrintProvider>{children}</PrintProvider>
        </CartProvider>
      </StoreProvider>
    </ToastProvider>
  );
}
