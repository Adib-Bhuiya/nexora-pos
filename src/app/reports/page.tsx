import type { Metadata } from 'next';
import { Guard } from '@/components/layout/Guard';
import Reports from '@/screens/Reports';

export const metadata: Metadata = { title: 'Reports' };

export default function Page() {
  return (
    <Guard permission="reports:view">
      <Reports />
    </Guard>
  );
}
