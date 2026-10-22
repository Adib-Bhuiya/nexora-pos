'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { MobileNav, Sidebar } from './Nav';
import { Topbar } from './Topbar';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  if (pathname?.startsWith('/reset-password')) {
    return (
      <div id="app-root" className="min-h-dvh bg-bg">
        {children}
      </div>
    );
  }

  return (
    <div id="app-root" className="min-h-dvh bg-bg">
      <a href="#main" className="sr-only z-[70] rounded-md bg-white px-3 py-2 text-xs font-bold focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <Topbar />
      <div className="md:grid md:min-h-[calc(100dvh-72px)] md:grid-cols-[218px_minmax(0,1fr)]">
        <Sidebar />
        <main id="main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1600px] px-[13px] pb-[34px] pt-[10px] outline-none md:p-[22px] lg:p-7">
          <MobileNav />
          <div key={pathname} className="page-enter">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
