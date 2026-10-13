'use client';

import Link from 'next/link';
import { buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Card';

export default function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      text="That page doesn’t exist."
      action={<Link href="/" className={buttonClasses('primary')}>Go to dashboard</Link>}
    />
  );
}
