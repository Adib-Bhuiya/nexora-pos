import type { Metadata } from 'next';
import Inventory from '@/screens/Inventory';

export const metadata: Metadata = { title: 'Inventory' };

export default function Page() {
  return <Inventory />;
}
