import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../lib/api';
import { organizationRequest } from '../lib/organization-api';

export function storeStatusKey(userID: string) {
  return ['merchant-store-status', userID] as const;
}

export function useStoreStatus(userID?: string, refetchOnWindowFocus = true) {
  return useQuery({
    queryKey: storeStatusKey(userID ?? ''),
    enabled: Boolean(userID),
    queryFn: async ({ signal }) => {
      const result = await organizationRequest<unknown>(
        '/organizations/store-status',
        { signal },
      );
      if (
        typeof result !== 'object' || result === null ||
        !('has_store' in result) || typeof result.has_store !== 'boolean' ||
        !('can_create_store' in result) || typeof result.can_create_store !== 'boolean' ||
        (result.has_store && result.can_create_store)
      ) throw new ApiError(502, 'Unexpected store status response');
      return { hasStore: result.has_store, canCreate: result.can_create_store };
    },
    gcTime: 0,
    refetchOnWindowFocus,
    retry: false,
  });
}
