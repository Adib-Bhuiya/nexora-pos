'use client';

import { useState } from 'react';
import { ChevronDown, CloudOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Segmented, Switch } from '@/components/ui/Fields';
import { StatusPill } from '@/components/ui/Bits';
import { cn } from '@/lib/cn';
import { useFormat } from '@/hooks/useFormat';
import { useStore } from '@/store/StoreProvider';
import type { SyncOperation } from '@/types';

type Filter = 'open' | 'synced';

export function SyncCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  const f = useFormat();
  const [filter, setFilter] = useState<Filter>('open');
  const [expanded, setExpanded] = useState<string | null>(null);

  const syncedCount = s.queue.filter((o) => o.status === 'synced').length;
  const rows = s.queue
    .filter((o) => (filter === 'open' ? o.status !== 'synced' : o.status === 'synced'))
    .sort((a, b) => b.seq - a.seq);
  const openCount = s.pendingCount + s.failedCount;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Sync status"
      description="Changes made on this device waiting to be sent to a server."
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={() => void s.syncNow()} loading={s.syncing} disabled={openCount === 0}>
            <RefreshCw size={14} aria-hidden /> {s.failedCount && !s.pendingCount ? 'Retry failed' : 'Sync now'}
          </Button>
        </>
      }
    >
      <Notice tone="warn" icon={<CloudOff size={15} />}>
        <strong>Demonstration only.</strong> No server is connected, so “syncing” just marks changes as done on this device. Nothing leaves your browser and
        other devices can’t see this data. The queue is the hook a real backend would plug into.
      </Notice>

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <Stat label="Connection" value={s.online ? 'Online' : 'Offline'} tone={s.online ? 'ok' : 'warn'} />
        <Stat label="Waiting" value={String(s.pendingCount)} />
        <Stat label="Failed" value={String(s.failedCount)} tone={s.failedCount ? 'danger' : undefined} />
      </div>

      <div className="mt-4 divide-y divide-line rounded-[11px] border border-line px-3.5">
        <ToggleRow
          label="Simulate offline mode"
          hint={s.deviceOnline ? 'Pretend the network is down to see changes queue up.' : 'Your device is offline right now.'}
          checked={s.simulatedOffline || !s.deviceOnline}
          disabled={!s.deviceOnline}
          onChange={s.setSimulatedOffline}
        />
        <ToggleRow label="Fail the next sync" hint="Shows how failed changes are kept and retried." checked={s.simulateFailure} onChange={s.setSimulateFailure} />
      </div>

      <div className="mb-3 mt-5 flex items-center justify-between gap-3">
        <Segmented<Filter>
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: `Waiting (${openCount})` },
            { value: 'synced', label: `History (${syncedCount})` },
          ]}
        />
        {filter === 'synced' && syncedCount > 0 && (
          <Button size="sm" variant="ghost" onClick={() => void s.clearSyncedHistory()}>
            Clear history
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-[11px] bg-[#f7f8fb] px-4 py-6 text-center text-xs text-muted">
          {filter === 'open' ? 'Nothing waiting. Every change on this device is marked synced.' : 'No synced changes yet.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((op) => (
            <OpRow key={op.id} op={op} open={expanded === op.id} onToggle={() => setExpanded(expanded === op.id ? null : op.id)} time={f.dateTime(op.createdAt)} />
          ))}
        </ul>
      )}
      <p className="mt-4 text-[11px] text-muted">
        Transport: {s.transportName} · Device ID: <span className="font-mono">{s.deviceId.slice(-8)}</span>
      </p>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'danger' }) {
  return (
    <div className="rounded-[11px] bg-[#f7f8fb] px-3.5 py-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={cn('text-[19px] font-extrabold tracking-[-0.5px]', tone === 'ok' && 'text-ok', tone === 'warn' && 'text-warn', tone === 'danger' && 'text-danger')}>{value}</div>
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-xs font-semibold">{label}</div>
        <div className="text-[11px] text-muted">{hint}</div>
      </div>
      <Switch label={label} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function OpRow({ op, open, onToggle, time }: { op: SyncOperation; open: boolean; onToggle: () => void; time: string }) {
  return (
    <li className="rounded-[11px] border border-line">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold">{op.label}</div>
          <div className="text-[11px] text-muted">
            #{op.seq} · {op.entity.replace('_', ' ')} {op.action} · {time}
            {op.attempts > 0 && ` · ${op.attempts} attempt${op.attempts === 1 ? '' : 's'}`}
          </div>
          {op.lastError && op.status === 'failed' && <div className="mt-0.5 text-[11px] text-danger">{op.lastError}</div>}
        </div>
        <StatusPill tone={op.status === 'pending' ? 'low' : op.status === 'failed' ? 'out' : 'good'}>{op.status === 'pending' ? 'Waiting' : op.status === 'failed' ? 'Failed' : 'Synced (demo)'}</StatusPill>
        <ChevronDown size={16} className={cn('shrink-0 text-muted transition-transform duration-150', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <pre className="max-h-[220px] overflow-auto border-t border-line bg-[#f7f8fb] px-3.5 py-3 text-[11px] leading-[1.5]">{JSON.stringify({ id: op.id, idempotencyKey: op.id, entity: op.entity, action: op.action, entityId: op.entityId, payload: op.payload }, null, 2)}</pre>
      )}
    </li>
  );
}
