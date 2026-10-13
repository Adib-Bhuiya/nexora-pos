import type { Metadata } from 'next';
import { Suspense } from 'react';
import Sales from '@/screens/Sales';

export const metadata: Metadata = { title: 'Sales history' };

export default function Page() {
  // useSearchParams (deep link ?sale=…) needs a Suspense boundary in static export.
  return (
    <Suspense fallback={null}>
      <Sales />
    </Suspense>
  );
}
