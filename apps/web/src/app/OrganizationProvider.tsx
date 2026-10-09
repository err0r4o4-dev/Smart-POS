import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthProvider';
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
  organizations: Organization[];
  context: OrganizationContext | null;
  branchID: string;
  loading: boolean;
  error: string;
  select: (orgID: string, branchID?: string) => void;
  refresh: () => Promise<void>;
  can: (permission: string) => boolean;
  invitationToken: string;
  clearInvitation: () => void;
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
export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const queryClient = useQueryClient();
  const userID = state.session?.user.id ?? '';
  const [selection, setSelection] = useState<Selection>({
    userID: '',
    orgID: '',
    branchID: '',
  });
  const [invitationToken, setInvitationToken] = useState(
    () =>
      new URLSearchParams(window.location.hash.slice(1)).get('invitation') ??
      '',
  );
  useEffect(() => {
    if (window.location.hash.startsWith('#invitation='))
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search,
      );
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
  const organizationsQuery = useQuery({
    queryKey: ['tenant', userID, 'organizations'],
    queryFn: ({ signal }) =>
      organizationRequest<Organization[]>('/organizations', { signal }),
    enabled: !!userID,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    retry: false,
  });
  const organizations = userID ? (organizationsQuery.data ?? []) : [];
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
      queryClient.getQueryData<Organization[]>([
        'tenant',
        userID,
        'organizations',
      ]) ?? organizations;
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
  };
  const failure = organizationsQuery.error ?? contextQuery.error;
  return (
    <OrganizationStateContext.Provider
      value={{
        organizations,
        context,
        branchID,
        select,
        refresh,
        loading:
          !!userID &&
          (organizationsQuery.isPending || (!!orgID && contextQuery.isPending)),
        error: failure instanceof Error ? failure.message : '',
        can: (permission) => context?.permissions.includes(permission) ?? false,
        invitationToken,
        clearInvitation: () => setInvitationToken(''),
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
