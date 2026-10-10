import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { organizationRequest } from '../../lib/organization-api';

export function useReturnsQuery<Result>(path: string) {
  const { state } = useAuth(),
    tenant = useOrganization(),
    org = tenant.context?.organization.id ?? '';
  return useQuery({
    queryKey: [
      'tenant',
      state.session?.user.id,
      org,
      tenant.branchID,
      'returns',
      path,
    ],
    queryFn: ({ signal }) =>
      organizationRequest<Result>(`/organizations/${org}${path}`, { signal }),
    enabled: !!org && !!path,
  });
}
export function useReturnsCommand() {
  const { state } = useAuth(),
    tenant = useOrganization(),
    client = useQueryClient(),
    org = tenant.context?.organization.id ?? '';
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  const controller = useRef(new AbortController()),
    keys = useRef(new Map<string, string>());
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    return () => current.abort();
  }, []);
  async function run<Result>(
    path: string,
    body: object,
  ): Promise<Result | undefined> {
    const current = controller.current,
      fingerprint = path + JSON.stringify(body),
      key = keys.current.get(fingerprint) ?? crypto.randomUUID();
    keys.current.set(fingerprint, key);
    setBusy(true);
    setError(null);
    try {
      const value = await organizationRequest<Result>(
        `/organizations/${org}${path}`,
        {
          method: 'POST',
          body,
          key,
          csrf: state.session?.csrf_token,
          signal: current.signal,
        },
      );
      if (current.signal.aborted) return;
      keys.current.delete(fingerprint);
      await client.invalidateQueries({
        queryKey: ['tenant', state.session?.user.id, org],
      });
      if (!current.signal.aborted) return value;
    } catch (problem) {
      if (!current.signal.aborted) setError(problem);
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }
  return { run, busy, error };
}
