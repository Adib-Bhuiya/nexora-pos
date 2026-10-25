'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BRAND, FACEBOOK_PAGE_URL } from '@/config/brand';
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
  const hasFacebookUrl = typeof FACEBOOK_PAGE_URL === 'string' && FACEBOOK_PAGE_URL.trim().length > 0;

  return (
    <aside className="sticky top-[72px] hidden h-[calc(100dvh-72px)] overflow-y-auto border-r border-line bg-white px-3.5 py-[22px] md:flex md:flex-col md:justify-between">
      <div>
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

        {/* Nexora POS Branding element directly below Staff & settings */}
        <div className="mt-3.5 pt-3.5 border-t border-line">
          <a
            href={hasFacebookUrl ? FACEBOOK_PAGE_URL : undefined}
            target={hasFacebookUrl ? '_blank' : undefined}
            rel={hasFacebookUrl ? 'noopener noreferrer' : undefined}
            onClick={(e) => {
              if (!hasFacebookUrl) {
                e.preventDefault();
              }
            }}
            onKeyDown={(e) => {
              if (!hasFacebookUrl && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
              }
            }}
            tabIndex={0}
            role={hasFacebookUrl ? undefined : 'button'}
            aria-disabled={!hasFacebookUrl ? 'true' : undefined}
            aria-label={
              hasFacebookUrl
                ? `Visit ${BRAND.name} ${BRAND.suffix} on Facebook (opens in a new tab)`
                : `${BRAND.name} ${BRAND.suffix} Facebook page`
            }
            title={
              hasFacebookUrl
                ? `Visit ${BRAND.name} ${BRAND.suffix} on Facebook`
                : `${BRAND.name} ${BRAND.suffix}`
            }
            className="group flex items-center gap-2.5 rounded-[12px] border border-line bg-white p-2.5 text-[14px] font-extrabold tracking-[-0.3px] transition-[background-color,border-color,transform,box-shadow] duration-150 hover:border-[#c8d6ff] hover:bg-[#f8faff] hover:shadow-sm active:scale-[.98] cursor-pointer"
          >
            <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl bg-brand text-[18px] font-black text-white transition-transform duration-150 group-hover:scale-105">
              N
            </div>
            <div className="leading-tight truncate min-w-0 text-left">
              <div className="truncate text-ink">
                <span>{BRAND.name}</span> <span className="text-brand">{BRAND.suffix}</span>
              </div>
              <small className="mt-0.5 block text-[9.5px] font-semibold tracking-[1.1px] text-muted truncate">
                {BRAND.tagline}
              </small>
            </div>
          </a>
        </div>
      </div>

      <div className="mx-[9px] mt-6 text-[10px] text-[#a0a8b5]">
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
