import { useLanguage } from '../../app/language';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Store } from 'lucide-react';
import {
  useOrganization,
  OrganizationProvider,
} from '../../app/OrganizationProvider';
import {
  canAccess,
  isManagementRole,
  roleLabels,
  workspaceHome,
} from '../../app/access';
import {
  paths,
  navigation,
  navigationGroups,
  type NavigationItem,
} from '../../app/routes';
import { Card, ErrorState, Loading, Tag } from '../../components/ui/primitives';
import { StandardPageHeader } from '../../components/ui/StandardPage';
import { WorkspaceAreaGate } from './WorkspaceRouting';

export function OrganizationWorkspaceProvider() {
  return (
    <OrganizationProvider>
      <WorkspaceAreaGate />
    </OrganizationProvider>
  );
}

export function WorkspaceEntryPage() {
  const { t, localize } = useLanguage();

  const tenant = useOrganization();
  if (tenant.loading)
    return <Loading>{t('workspace.selectingWorkspace')}</Loading>;
  if (tenant.error)
    return (
      <ErrorState
        message={localize(tenant.error ?? '')}
        retry={() => void tenant.refresh()}
      />
    );
  if (!tenant.context)
    return (
      <Navigate
        to={tenant.storeMode === 'multi' ? paths.setup : paths.forbidden}
        replace
      />
    );
  return (
    <Navigate to={workspaceHome(tenant.context.membership.role)} replace />
  );
}

function TaskCards({ items }: { items: NavigationItem[] }) {
  const { t, localize } = useLanguage();

  const tenant = useOrganization();
  if (!tenant.context) return null;
  const access = {
    authenticated: true as const,
    role: tenant.context.membership.role,
    permissions: tenant.context.permissions,
  };
  const visibleItems = items.filter((item) =>
    canAccess(access, item.permission, item.roles),
  );
  if (!visibleItems.length)
    return (
      <p role="status">{t('workspace.noAuthorizedToolsInThisAreaContact')}</p>
    );
  return (
    <div className="workspace-task-grid">
      {visibleItems.map((item) => (
        <Link key={item.to} className="workspace-task" to={item.to}>
          <span>{localize(item.label ?? '')}</span>
          <ArrowRight size={19} aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}

export function ManagementHomePage() {
  const { t, localize } = useLanguage();
  const tenant = useOrganization();
  if (!tenant.context) return null;
  const role = tenant.context.membership.role;
  if (!isManagementRole(role)) return <Navigate to={paths.forbidden} replace />;
  const branchName =
    tenant.context.branches.find((branch) => branch.id === tenant.branchID)
      ?.name ?? t('workspace.mainBranch');
  const access = {
    authenticated: true as const,
    role,
    permissions: tenant.context.permissions,
  };
  const groups = navigationGroups
    .map((group) => ({
      ...group,
      items: navigation.filter(
        (item) =>
          group.paths.includes(item.to) &&
          canAccess(access, item.permission, item.roles),
      ),
    }))
    .filter((group) => group.items.length > 0);
  return (
    <div className="workspace-home">
      <StandardPageHeader
        icon={<Store size={24} />}
        title={t('workspace.storeOverview')}
        headingTabIndex={-1}
        description={t('workspace.overviewSubtitle', {
          store: tenant.context.organization.name,
          branch: branchName,
        })}
        actions={<Tag tone="amber">{localize(roleLabels[role])}</Tag>}
      />
      {groups.map((group) => (
        <Card key={group.id}>
          <h2>{localize(group.label)}</h2>
          <TaskCards items={group.items} />
        </Card>
      ))}
    </div>
  );
}
