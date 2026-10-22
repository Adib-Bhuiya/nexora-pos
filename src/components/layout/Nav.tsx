'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BRAND } from '@/config/brand';
import { ROUTES } from '@/config/routes';
import { cn } from '@/lib/cn';
import { useStore } from '@/store/StoreProvider';

/** Trailing-slash safe: '/checkout/' matches '/checkout'. Dashboard ('/') only matches exactly. */
export const isActivePath = (pathname: string, path: string) => {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return path === '/' ? p === '/' : p === path || p.startsWith(path + '/');
};

export function useVisibleRoutes() {
  const { can } = useStore();
  return ROUTES.filter((r) => !r.permission || can(r.permission));
}

export function Sidebar() {
  const routes = useVisibleRoutes();
  const pathname = usePathname();
  return (
    <aside className="sticky top-[72px] hidden h-[calc(100dvh-72px)] overflow-y-auto border-r border-line bg-white px-3.5 py-[22px] md:block">
      <div className="px-3 pb-3 pt-1.5 text-[10px] font-extrabold tracking-[1.5px] text-[#9aa3b2]">WORKSPACE</div>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {routes.map((r) => {
          const active = isActivePath(pathname, r.path);
          return (
            <Link
              key={r.path}
              href={r.path}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-[10px] p-3 text-[13px] font-semibold transition-[background-color,color,transform] duration-100 active:scale-[.98]',
                active ? 'bg-brand-soft text-[#2853c6]' : 'text-[#667186] hover:bg-[#f4f6fa]',
              )}
            >
              <r.icon size={18} aria-hidden />
              {r.label}
            </Link>
          );
        })}
      </nav>
      <div className="mx-[9px] my-[17px] text-[10px] text-[#a0a8b5]">
        <div>Built by Adib Bhuiya</div>
        <div>
          {BRAND.name} {BRAND.suffix} · v{BRAND.version}
        </div>
      </div>
    </aside>
  );
}

/** Phone navigation: horizontally scrolling chips on a translucent, sticky strip. */
export function MobileNav() {
  const routes = useVisibleRoutes();
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [pathname]);

  return (
    <nav ref={ref} aria-label="Main" className="material sticky top-[62px] z-20 -mx-[13px] mb-4 flex gap-1.5 overflow-x-auto px-[13px] py-2 md:hidden [scrollbar-width:none]">
      {routes.map((r) => {
        const active = isActivePath(pathname, r.path);
        return (
          <Link
            key={r.path}
            href={r.path}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex shrink-0 min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-[9px] border px-3.5 py-2 text-xs font-bold transition-[background-color,transform] duration-100 active:scale-[.97]',
              active ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink',
            )}
          >
            <r.icon size={14} aria-hidden />
            {r.short}
          </Link>
        );
      })}
    </nav>
  );
}
