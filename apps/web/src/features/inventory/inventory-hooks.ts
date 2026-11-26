import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { organizationRequest } from '../../lib/organization-api';

export function useInventoryCommand() {
  const { state } = useAuth();
  const tenant = useOrganization();
  const client = useQueryClient();
  const user = state.session?.user.id ?? '';
  const org = tenant.context?.organization.id ?? '';
  const branch = tenant.branchID;
  const scope = JSON.stringify([user, org, branch]);
  const key = ['tenant', user, org, branch, 'inventory'];
  const base = `/organizations/${org}/inventory`;
  const [feedback, setFeedback] = useState<{
    scope: string;
    busy: boolean;
    error: unknown;
    success: string;
  }>({ scope, busy: false, error: null, success: '' });
  const lifecycle = useRef({
    controller: new AbortController(),
    keys: new Map<string, string>(),
    locked: false,
  });
  useEffect(() => {
    const current = {
      controller: new AbortController(),
      keys: new Map<string, string>(),
      locked: false,
    };
    lifecycle.current = current;
    return () => current.controller.abort();
  }, [user, org, branch]);

  async function read<Result>(suffix: string): Promise<Result> {
    const current = lifecycle.current;
    try {
      const result = await organizationRequest<Result>(base + suffix, {
        signal: current.controller.signal,
      });
      current.controller.signal.throwIfAborted();
      return result;
    } catch (error) {
      if (!current.controller.signal.aborted)
        setFeedback({ scope, busy: current.locked, error, success: '' });
      throw error;
    }
  }

  async function run<Result>(
    suffix: string,
    method: string,
    body: object,
  ): Promise<Result> {
    const current = lifecycle.current;
    current.controller.signal.throwIfAborted();
    if (current.locked) throw new Error('กรุณารอให้รายการปัจจุบันเสร็จสิ้น');
    current.locked = true;
    setFeedback({ scope, busy: true, error: null, success: '' });
    const fingerprint = `${method}:${suffix}:${JSON.stringify(body)}`;
    const requestKey = current.keys.get(fingerprint) ?? crypto.randomUUID();
    current.keys.set(fingerprint, requestKey);
    try {
      const result = await organizationRequest<Result>(base + suffix, {
        method,
        body,
        csrf: state.session?.csrf_token,
        key: requestKey,
        signal: current.controller.signal,
      });
      current.controller.signal.throwIfAborted();
      await client.invalidateQueries({ queryKey: key });
      current.controller.signal.throwIfAborted();
      current.keys.delete(fingerprint);
      setFeedback({
        scope,
        busy: false,
        error: null,
        success: 'บันทึกรายการแล้ว',
      });
      return result;
    } catch (error) {
      if (!current.controller.signal.aborted)
        setFeedback({ scope, busy: false, error, success: '' });
      throw error;
    } finally {
      current.locked = false;
    }
  }
  return {
    key,
    base,
    run,
    read,
    ...(feedback.scope === scope
      ? feedback
      : { busy: false, error: null, success: '' }),
  };
}

export type InventoryRun = ReturnType<typeof useInventoryCommand>['run'];
