import type { Metadata } from 'next';
import Settings from '@/screens/Settings';

export const metadata: Metadata = { title: 'Staff & settings' };

export default function Page() {
  return <Settings />;
}
