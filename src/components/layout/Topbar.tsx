'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, RefreshCw, Settings as SettingsIcon, TriangleAlert } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { ROLE_LABEL } from '@/config/permissions';
import { cn } from '@/lib/cn';
import { useStore } from '@/store/StoreProvider';
import { useToast } from '@/components/ui/Toast';
import { Avatar } from '@/components/ui/Bits';
import { SyncCenter } from '@/components/sync/SyncCenter';

export function Topbar() {
  const { online, deviceOnline, simulatedOffline, setSimulatedOffline, syncing, pendingCount, failedCount } = useStore();
  const { notify } = useToast();
  const [syncOpen, setSyncOpen] = useState(false);

  const connectionLabel = online ? 'Online' : simulatedOffline && deviceOnline ? 'Offline · simulated' : 'Offline';
  const syncLabel = syncing ? 'Syncing…' : failedCount ? `${failedCount} failed` : pendingCount ? `${pendingCount} pending` : 'Synced';

  return (
    <header className="material sticky top-0 z-30 flex h-[62px] items-center justify-between border-b border-line px-3.5 md:h-[72px] md:px-[26px]">
      <Link href="/" className="flex min-w-0 shrink items-center gap-2 text-[15px] font-extrabold tracking-[-0.4px] md:gap-3 md:text-[length:inherit]" aria-label={`${BRAND.name} ${BRAND.suffix} dashboard`}>
        <div className="grid h-[34px] w-[34px] place-items-center rounded-xl bg-brand text-[19px] text-white md:h-[39px] md:w-[39px]">N</div>
        <div className="leading-tight">
          {BRAND.name} <span className="text-brand">{BRAND.suffix}</span>
          <small className="mt-0.5 block text-[10px] font-semibold tracking-[1.2px] text-muted max-[460px]:hidden">{BRAND.tagline}</small>
        </div>
      </Link>

      <div className="flex items-center gap-1.5 md:gap-2.5">
        <button
          type="button"
          onClick={() => {
            if (!deviceOnline) notify('Your device is offline. Reconnect to go online.', { tone: 'warning' });
            else {
              setSimulatedOffline(!simulatedOffline);
            }
          }}
          title={deviceOnline ? 'Click to simulate going offline / online' : 'Your device has no network connection'}
          aria-label={`Connection: ${connectionLabel}. ${deviceOnline ? 'Activate to toggle simulated offline mode.' : ''}`}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold transition-[transform,background-color] duration-100 active:scale-[.96]',
            online ? 'bg-[#e7f7ef] text-ok' : 'bg-[#fff2dc] text-warn',
          )}
        >
          <span aria-hidden>●</span>
          <span className="max-[400px]:hidden">{connectionLabel}</span>
          <span className="min-[401px]:hidden">{online ? 'Online' : 'Offline'}</span>
        </button>

        <button
          type="button"
          onClick={() => setSyncOpen(true)}
          aria-label={`Sync status: ${syncLabel}. Open details.`}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[9px] border border-line bg-white px-3 text-xs font-bold max-[420px]:px-2.5 transition-[transform,background-color] duration-100 hover:bg-[#f8faff] active:scale-[.97]"
        >
          {failedCount ? <TriangleAlert size={14} className="text-danger" /> : <RefreshCw size={14} className={cn(syncing && 'animate-spin', !syncing && !pendingCount && 'text-ok')} />}
          {/* Narrow phones: icon + count only (the full state is in the aria-label). */}
          <span className="max-[420px]:hidden">{syncLabel}</span>
          <span className="tabular min-[421px]:hidden">{failedCount || pendingCount || ''}</span>
        </button>

        <UserMenu />
      </div>
      <SyncCenter open={syncOpen} onClose={() => setSyncOpen(false)} />
    </header>
  );
}

function UserMenu() {
  const { user, users, actions } = useStore();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
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
        className="flex items-center gap-2 rounded-full transition-transform duration-100 active:scale-95"
      >
        <Avatar initials={user.initials} size={36} />
        <span className="hidden rounded-full bg-[#eef1f6] px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#667186] md:inline">{user.role === 'owner' ? 'Owner' : 'Cashier'}</span>
      </button>
      {open && (
        <div role="menu" className="pop-enter material absolute right-0 top-[calc(100%+8px)] z-40 w-[280px] origin-top-right rounded-[14px] border border-line p-2 shadow-[0_16px_48px_#1720332e]">
          <div className="px-2.5 pb-2 pt-1.5">
            <div className="text-[13px] font-extrabold">{user.name}</div>
            <div className="text-[11px] text-muted">{ROLE_LABEL[user.role]}</div>
          </div>
          <div className="px-2.5 pb-1 pt-1 text-[10px] font-extrabold uppercase tracking-[1.2px] text-[#8993a4]">Switch profile</div>
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              role="menuitemradio"
              aria-checked={u.id === user.id}
              onClick={async () => {
                setOpen(false);
                if (u.id !== user.id) {
                  await actions.switchUser(u.id);
                  notify(`Now viewing as ${u.name} (${ROLE_LABEL[u.role]}).`);
                }
              }}
              className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors duration-100 hover:bg-[#eef1f6] active:bg-[#e4e9f2]"
            >
              <Avatar initials={u.initials} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold">{u.name}</span>
                <span className="block text-[10px] text-muted">{ROLE_LABEL[u.role]}</span>
              </span>
              {u.id === user.id && <Check size={15} className="text-brand" />}
            </button>
          ))}
          <div className="my-1 border-t border-line" />
          <Link href="/settings" onClick={() => setOpen(false)} role="menuitem" className="flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-xs font-bold text-[#394356] hover:bg-[#eef1f6]">
            <SettingsIcon size={14} /> Staff &amp; settings
          </Link>
        </div>
      )}
    </div>
  );
}
