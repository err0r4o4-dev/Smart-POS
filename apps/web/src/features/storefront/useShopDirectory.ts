import { useQuery } from '@tanstack/react-query';
import {
  storefrontRequest,
  type ShopDirectoryEntry,
} from '../../lib/storefront-api';

export function useShopDirectory() {
  return useQuery({
    queryKey: ['storefront-directory'],
    queryFn: ({ signal }) =>
      storefrontRequest<ShopDirectoryEntry[]>('', {
        signal,
        storeMode: () => {},
      }),
    retry: false,
  });
}
