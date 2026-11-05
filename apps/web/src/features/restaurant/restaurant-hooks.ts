import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { ApiError } from '../../lib/api';
import { posRequest } from '../../lib/pos-api';

export function useRestaurantScope() {
  const { state } = useAuth();
  const tenant = useOrganization();
  const org = tenant.context?.organization.id ?? '';
  const user = state.session?.user.id ?? '';
  return {
    org,
    user,
    branch: tenant.branchID,
    csrf: state.session?.csrf_token,
    can: tenant.can,
  };
}

export function useRestaurantQuery<Result>(
  path: string,
  permission: string,
  poll = false,
  enabled = true,
) {
  const scope = useRestaurantScope();
  return useQuery({
    queryKey: [
      'tenant',
      scope.user,
      scope.org,
      scope.branch,
      'restaurant',
      path,
      scope.can(permission),
    ],
    queryFn: ({ signal }) => posRequest<Result>(scope.org, path, { signal }),
    enabled:
      !!scope.user &&
      !!scope.org &&
      !!scope.branch &&
      scope.can(permission) &&
      enabled,
    retry: false,
    refetchInterval: poll ? 15000 : false,
    refetchOnWindowFocus: poll,
  });
}

export function useRestaurantCommand<Result>(
  path: string,
  method: string,
  saved?: (result: Result) => void,
) {
  const scope = useRestaurantScope();
  const client = useQueryClient();
  const active = useRef(false);
  const attempt = useRef<{ body: object; key: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const mutation = useMutation({
    mutationFn: (input: { body: object; key: string }) =>
      posRequest<Result>(scope.org, path, {
        ...input,
        method,
        csrf: scope.csrf,
      }),
    onSuccess: (result) => {
      attempt.current = null;
      setUncertain(false);
      saved?.(result);
      void client.invalidateQueries({
        queryKey: ['tenant', scope.user, scope.org],
      });
    },
    onError: (error) => {
      const unknownCommit = !(error instanceof ApiError) || error.status >= 500;
      setUncertain(unknownCommit);
      if (!unknownCommit) attempt.current = null;
    },
    onSettled: () => {
      active.current = false;
    },
    retry: false,
  });
  return {
    ...mutation,
    locked: mutation.isPending || uncertain,
    uncertain,
    run: (body: object) => {
      if (active.current) return;
      active.current = true;
      attempt.current ??= { body, key: crypto.randomUUID() };
      mutation.mutate(attempt.current);
    },
  };
}
