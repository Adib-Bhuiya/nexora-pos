import { useMemo } from 'react';
import { makeFormatters } from '@/lib/format';
import { useStore } from '@/store/StoreProvider';

export const useFormat = () => {
  const { settings } = useStore();
  return useMemo(() => makeFormatters(settings.currencyCode), [settings.currencyCode]);
};
