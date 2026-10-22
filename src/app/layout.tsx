import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { BRAND } from '@/config/brand';
import { Providers } from './providers';
import './globals.css';

const fullName = `${BRAND.name} ${BRAND.suffix}`;

export const metadata: Metadata = {
  title: { default: `${fullName} — Retail Point of Sale`, template: `%s · ${fullName}` },
  description: 'Retail point of sale system with inventory, receipt printing, and sales records.',
  icons: { icon: '/favicon.svg', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#315bd6',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
