import type { Metadata } from 'next';
import Checkout from '@/screens/Checkout';

export const metadata: Metadata = { title: 'Point of sale' };

export default function Page() {
  return <Checkout />;
}
