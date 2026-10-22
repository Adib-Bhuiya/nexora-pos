'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ToastProvider } from '@/components/ui/Toast';
import { CartProvider } from '@/store/CartProvider';
import { PrintProvider } from '@/store/PrintProvider';
import { StoreProvider } from '@/store/StoreProvider';

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();

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
