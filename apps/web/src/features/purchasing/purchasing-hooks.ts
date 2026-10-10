import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { organizationRequest } from '../../lib/organization-api';

export function useSupplyScope() {
  const tenant = useOrganization(),
    auth = useAuth(),
    client = useQueryClient();
  const org = tenant.context?.organization.id ?? '',
    branch = tenant.branchID,
    user = auth.state.session?.user.id ?? '';
  const scope = ['tenant', user, org, branch, 'supply'];
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [success, setSuccess] = useState('');
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
    method = 'POST',
  ): Promise<Result> {
    setBusy(true);
    setError(null);
    setSuccess('');
    const requestController = controller.current;
    const fingerprint = method + ':' + path + ':' + JSON.stringify(body),
      key = keys.current.get(fingerprint) ?? crypto.randomUUID();
    keys.current.set(fingerprint, key);
    try {
      const result = await organizationRequest<Result>(
        `/organizations/${org}${path}`,
        {
          method,
          body,
          key,
          csrf: auth.state.session?.csrf_token,
          signal: requestController.signal,
        },
      );
      if (requestController.signal.aborted)
        throw new DOMException('Scope changed', 'AbortError');
      if (!requestController.signal.aborted) {
        keys.current.delete(fingerprint);
        await client.invalidateQueries({ queryKey: ['tenant', user, org] });
        setSuccess('บันทึกสำเร็จ — ข้อมูลและสต็อกแสดงตามผลจาก server');
      }
      return result;
    } catch (problem) {
      if (!requestController.signal.aborted) setError(problem);
      throw problem;
    } finally {
      if (!requestController.signal.aborted) setBusy(false);
    }
  }
  return { tenant, org, branch, user, scope, busy, error, success, run };
}
export function useSupplyQuery<Result>(path: string, enabled = true) {
  const tenant = useOrganization(),
    auth = useAuth(),
    org = tenant.context?.organization.id;
  return useQuery({
    queryKey: [
      'tenant',
      auth.state.session?.user.id,
      org,
      tenant.branchID,
      'supply',
      path,
    ],
    queryFn: ({ signal }) =>
      organizationRequest<Result>(`/organizations/${org}${path}`, { signal }),
    enabled: !!org && enabled,
  });
}
export type SupplyScope = ReturnType<typeof useSupplyScope>;
