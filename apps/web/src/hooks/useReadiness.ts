import { useQuery } from '@tanstack/react-query';
import { getReadiness } from '../lib/api';

export function useReadiness() {
  return useQuery({
    queryKey: ['system', 'readiness'],
    queryFn: ({ signal }) => getReadiness(signal),
    refetchInterval: 30_000,
  });
}
