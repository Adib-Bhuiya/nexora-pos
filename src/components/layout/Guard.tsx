'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { LockKeyhole } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Card';
import type { Permission } from '@/config/permissions';
import { useStore } from '@/store/StoreProvider';

/** Hides a page for roles without the permission. */
export function Guard({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can, user } = useStore();
  if (can(permission)) return <>{children}</>;
  return (
    <EmptyState
      icon={<LockKeyhole size={20} />}
      title="Not available for this role"
      text={`${user.name} (${user.role}) does not have permission to open this page.`}
      action={<Link href="/" className={buttonClasses('primary')}>Back to dashboard</Link>}
    />
  );
}
