import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthProvider';
import { useStoreStatus } from './useStoreStatus';
import { ApiError } from '../lib/api';
import type { StoreMode } from '../lib/store-mode';
import {
  organizationRequest,
  type Organization,
  type OrganizationContext,
} from '../lib/organization-api';
interface Selection {
  userID: string;
  orgID: string;
  branchID: string;
}
interface OrganizationState {
  storeMode: StoreMode | null;
  organizations: Organization[];
  context: OrganizationContext | null;
  branchID: string;
  loading: boolean;
  error: string;
  errorCode?: string;
  select: (orgID: string, branchID?: string) => void;
  refresh: () => Promise<void>;
  can: (permission: string) => boolean;
}
const OrganizationStateContext = createContext<OrganizationState | null>(null);
function readSelection(userID: string): Selection {
  try {
    const stored = JSON.parse(
      sessionStorage.getItem(`smartpos-context:${userID}`) ?? '{}',
    ) as Partial<Selection>;
    return {
      userID,
      orgID: stored.orgID ?? '',
      branchID: stored.branchID ?? '',
    };
  } catch {
    return { userID, orgID: '', branchID: '' };
  }
}
export function OrganizationProvider({
  children,
  allowNewStoreWithoutMFA = false,
}: {
  children: ReactNode;
  allowNewStoreWithoutMFA?: boolean;
}) {
  const { state } = useAuth();
  const queryClient = useQueryClient();
  const userID = state.session?.user.id ?? '';
  const [selection, setSelection] = useState<Selection>({
    userID: '',
    orgID: '',
    branchID: '',
  });
  useEffect(() => {
    if (window.location.hash.startsWith('#invitation=')) {
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
    }
  }, []);
  useEffect(() => {
    if (state.status === 'anonymous') {
      void queryClient.cancelQueries({ queryKey: ['tenant'] });
      queryClient.removeQueries({ queryKey: ['tenant'] });
      try {
        for (const key of Object.keys(sessionStorage))
          if (key.startsWith('smartpos-context:'))
            sessionStorage.removeItem(key);
      } catch {
        return;
      }
    }
  }, [state.status, queryClient]);
  const chosen =
    selection.userID === userID ? selection : readSelection(userID);
  const keepSetupDraft = (error: unknown) =>
    allowNewStoreWithoutMFA && error instanceof ApiError &&
    error.code === 'MFA_REQUIRED';
  const organizationsQuery = useQuery({
    queryKey: ['tenant', userID, 'organizations'],
    queryFn: async ({ signal }) => {
      const metadata: { storeMode: StoreMode } = { storeMode: 'multi' };
      const items = await organizationRequest<Organization[]>(
        '/organizations',
        {
          signal,
          storeMode: (mode) => {
            metadata.storeMode = mode;
          },
        },
      );
      if (metadata.storeMode === 'single' && items.length > 1)
        throw new ApiError(
          502,
          'ข้อมูลร้านเดียวไม่ถูกต้อง กรุณาตรวจการตั้งค่าระบบ',
        );
      return { items, storeMode: metadata.storeMode };
    },
    enabled: !!userID,
    // Returning from MFA must not replace an in-progress setup form.
    refetchOnWindowFocus: (query) => !keepSetupDraft(query.state.error),
    refetchInterval: (query) => keepSetupDraft(query.state.error) ? false : 30_000,
    retry: false,
  });
  // Allow only the blank setup form when the protected list is unavailable.
  const checkNewStore = keepSetupDraft(organizationsQuery.error) &&
    state.session?.user.email_verified === true &&
    Boolean(userID);
  const storeStatus = useStoreStatus(checkNewStore ? userID : undefined, false);
  const newStoreOnly = checkNewStore && storeStatus.isSuccess && !storeStatus.data.hasStore;
  const organizations =
    userID && !organizationsQuery.isError
      ? (organizationsQuery.data?.items ?? [])
      : [];
  const storeMode = newStoreOnly
    ? (storeStatus.data?.canCreate ? 'multi' : 'single')
    : userID && !organizationsQuery.isError
      ? (organizationsQuery.data?.storeMode ?? null)
      : null;
  const orgID =
    organizations.find((item) => item.id === chosen.orgID)?.id ??
    organizations[0]?.id ??
    '';
  const contextQuery = useQuery({
    queryKey: ['tenant', userID, orgID, 'context'],
    queryFn: ({ signal }) =>
      organizationRequest<OrganizationContext>(
        `/organizations/${orgID}/context`,
        { signal },
      ),
    enabled: !!userID && !!orgID,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    retry: false,
  });
  const context =
    userID && orgID && !contextQuery.isError && !organizationsQuery.isError
      ? (contextQuery.data ?? null)
      : null;
  const branchID =
    context?.branches.find((item) => item.id === chosen.branchID)?.id ??
    context?.branches[0]?.id ??
    '';
  const select = (target: string, branch = '') => {
    const available =
      queryClient.getQueryData<{ items: Organization[]; storeMode: StoreMode }>(
        ['tenant', userID, 'organizations'],
      )?.items ?? organizations;
    if (!available.some((item) => item.id === target)) return;
    if (
      branch &&
      (context?.organization.id !== target ||
        !context.branches.some((item) => item.id === branch))
    )
      return;
    void queryClient.cancelQueries({ queryKey: ['tenant'] });
    queryClient.removeQueries({ queryKey: ['tenant', userID, orgID] });
    const next = { userID, orgID: target, branchID: branch };
    setSelection(next);
    try {
      sessionStorage.setItem(
        `smartpos-context:${userID}`,
        JSON.stringify(next),
      );
    } catch {
      return;
    }
  };
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['tenant'] });
    if (checkNewStore && storeStatus.isError)
      await storeStatus.refetch();
  };
  const failure = newStoreOnly ? null :
    (checkNewStore ? storeStatus.error : null) ??
    organizationsQuery.error ?? contextQuery.error;
  return (
    <OrganizationStateContext.Provider
      value={{
        storeMode,
        organizations,
        context,
        branchID,
        select,
        refresh,
        loading:
          !!userID &&
          (organizationsQuery.isPending || (!!orgID && contextQuery.isPending) ||
            (checkNewStore && storeStatus.isPending)),
        error: failure instanceof Error ? failure.message : '',
        errorCode: failure instanceof ApiError ? failure.code : undefined,
        can: (permission) => context?.permissions.includes(permission) ?? false,
      }}
    >
      {children}
    </OrganizationStateContext.Provider>
  );
}
export function useOrganization() {
  const value = useContext(OrganizationStateContext);
  if (!value) throw new Error('OrganizationProvider is required');
  return value;
}
export function useOptionalOrganization() {
  return useContext(OrganizationStateContext);
}
