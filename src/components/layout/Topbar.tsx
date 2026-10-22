'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LogOut, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { ROLE_LABEL } from '@/config/permissions';
import { cn } from '@/lib/cn';
import { useStore } from '@/store/StoreProvider';
import { useToast } from '@/components/ui/Toast';
import { Avatar } from '@/components/ui/Bits';

export function Topbar() {
  const { refreshingProducts, refreshProducts } = useStore();

  return (
    <header className="material sticky top-0 z-30 flex h-[62px] items-center justify-between border-b border-line px-3.5 md:h-[72px] md:px-[26px]">
      <Link href="/" className="flex min-w-0 shrink items-center gap-2 text-[15px] font-extrabold tracking-[-0.4px] md:gap-3 md:text-[length:inherit]" aria-label={`${BRAND.name} ${BRAND.suffix} dashboard`}>
        <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl bg-brand text-[19px] text-white md:h-[39px] md:w-[39px]">N</div>
        <div className="leading-tight truncate min-w-0">
          <span className="truncate">{BRAND.name}</span> <span className="text-brand">{BRAND.suffix}</span>
          <small className="mt-0.5 block text-[10px] font-semibold tracking-[1.2px] text-muted max-[460px]:hidden truncate">{BRAND.tagline}</small>
        </div>
      </Link>

      <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 shrink-0">
        {/* Instant Sync Button: immediately fetches latest products from server */}
        <button
          type="button"
          onClick={() => void refreshProducts({ silent: false })}
          disabled={refreshingProducts}
          aria-label={refreshingProducts ? 'Refreshing products…' : 'Sync products with server'}
          title="Fetch latest products from server"
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[9px] border border-line bg-white px-2.5 sm:px-3 text-xs font-bold transition-[transform,background-color] duration-100 hover:bg-[#f8faff] active:scale-[.97] disabled:opacity-60 cursor-pointer"
        >
          <RefreshCw size={14} className={cn(refreshingProducts && 'animate-spin', !refreshingProducts && 'text-brand')} />
          <span className="max-[440px]:hidden">{refreshingProducts ? 'Syncing…' : 'Sync'}</span>
        </button>

        <UserMenu />
      </div>
    </header>
  );
}

function UserMenu() {
  const { user, actions } = useStore();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${user.name}, ${ROLE_LABEL[user.role]}. Open user menu`}
        className="flex min-h-[38px] items-center gap-2 rounded-full p-1 pl-1.5 pr-2 transition-all duration-100 hover:bg-[#f0f3f8] active:scale-95 cursor-pointer"
      >
        <Avatar initials={user.initials} size={34} />
        <span className="hidden sm:inline text-xs font-bold text-ink max-w-[120px] truncate">
          {user.name.split(' ')[0]}
        </span>
        <span className="hidden rounded-full bg-[#eef1f6] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#667186] md:inline">
          {user.role === 'owner' ? 'Owner' : 'Cashier'}
        </span>
      </button>

      {open && (
        <div role="menu" className="pop-enter material absolute right-0 top-[calc(100%+8px)] z-40 w-[240px] max-w-[calc(100vw-24px)] origin-top-right rounded-[14px] border border-line p-2 shadow-[0_16px_48px_#1720332e]">
          <div className="px-2.5 pb-2 pt-1.5">
            <div className="text-[13px] font-extrabold truncate">{user.name}</div>
            <div className="text-[11px] text-muted flex items-center justify-between">
              <span>{ROLE_LABEL[user.role]}</span>
              {user.email && <span className="truncate max-w-[130px]">{user.email}</span>}
            </div>
          </div>

          <div className="my-1 border-t border-line" />
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-xs font-bold text-[#394356] hover:bg-[#eef1f6]"
          >
            <SettingsIcon size={14} /> Staff &amp; settings
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={loggingOut}
            onClick={async () => {
              setLoggingOut(true);
              try {
                await actions.logout();
                setOpen(false);
                notify('Signed out successfully.', { tone: 'info' });
              } catch {
                // actions.logout already handles user feedback
              } finally {
                setLoggingOut(false);
              }
            }}
            className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-xs font-bold text-danger hover:bg-red-50 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <LogOut size={14} className={loggingOut ? 'animate-spin' : ''} />
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
