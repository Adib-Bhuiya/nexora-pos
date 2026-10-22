'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ToastProvider } from '@/components/ui/Toast';
import { initServiceWorker } from '@/hooks/useServiceWorker';
import { CartProvider } from '@/store/CartProvider';
import { PrintProvider } from '@/store/PrintProvider';
import { StoreProvider } from '@/store/StoreProvider';

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    initServiceWorker(); // production builds only
  }, []);

  if (pathname?.startsWith('/reset-password')) {
    return <ToastProvider>{children}</ToastProvider>;
  }

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
