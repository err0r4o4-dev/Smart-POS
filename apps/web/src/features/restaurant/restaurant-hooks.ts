import { useLayoutEffect, useRef, useState } from 'react';
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

interface RestaurantAttempt {
  identity: string;
  user: string;
  org: string;
  path: string;
  method: string;
  body: string;
  key: string;
  uncertain: boolean;
}

export function useRestaurantCommand<Result>(
  path: string,
  method: string,
  saved?: (result: Result) => void,
) {
  const scope = useRestaurantScope();
  const client = useQueryClient();
  const identity = JSON.stringify([
    scope.user,
    scope.org,
    scope.branch,
    path,
    method,
  ]);
  const current = useRef<{ identity: string; saved: typeof saved } | null>(
    null,
  );
  useLayoutEffect(() => {
    current.current = { identity, saved };
    return () => {
      current.current = null;
    };
  }, [identity, saved]);
  const active = useRef<RestaurantAttempt | null>(null);
  const attempt = useRef<RestaurantAttempt | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const mutation = useMutation({
    mutationFn: ({
      command,
      csrf,
    }: {
      command: RestaurantAttempt;
      csrf?: string;
    }) => {
      if (current.current?.identity !== command.identity)
        throw new ApiError(403, 'Restaurant command context changed');
      return posRequest<Result>(command.org, command.path, {
        body: JSON.parse(command.body) as object,
        key: command.key,
        method: command.method,
        csrf,
      });
    },
    onSuccess: (result, { command }) => {
      if (attempt.current !== command) return;
      attempt.current = null;
      void client.invalidateQueries({
        queryKey: ['tenant', command.user, command.org],
      });
      if (current.current) setUncertain(false);
      if (current.current?.identity === command.identity) {
        current.current.saved?.(result);
      }
    },
    onError: (error, { command }) => {
      if (attempt.current !== command) return;
      const unknownCommit =
        !(error instanceof ApiError) ||
        error.status < 400 ||
        error.status >= 500 ||
        [401, 403, 408].includes(error.status);
      // A later rejection cannot disprove an earlier unknown commit.
      command.uncertain ||= unknownCommit;
      if (!command.uncertain) attempt.current = null;
      if (current.current) setUncertain(command.uncertain);
    },
    onSettled: (_result, _error, { command }) => {
      if (active.current === command) active.current = null;
    },
    retry: false,
  });
  const matches = mutation.variables?.command.identity === identity;
  return {
    ...mutation,
    data: matches ? mutation.data : undefined,
    error: matches ? mutation.error : null,
    isSuccess: matches && mutation.isSuccess,
    isError: matches && mutation.isError,
    locked: mutation.isPending || uncertain,
    uncertain,
    run: (body: object) => {
      if (
        active.current ||
        current.current?.identity !== identity ||
        !scope.user ||
        !scope.org ||
        !scope.branch
      )
        return;
      if (attempt.current && attempt.current.identity !== identity) return;
      attempt.current ??= {
        identity,
        user: scope.user,
        org: scope.org,
        path,
        method,
        body: JSON.stringify(body),
        key: crypto.randomUUID(),
        uncertain: false,
      };
      active.current = attempt.current;
      mutation.mutate({ command: attempt.current, csrf: scope.csrf });
    },
  };
}
