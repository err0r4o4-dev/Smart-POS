import { useLanguage } from '../../app/language';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, BookOpen, ShieldCheck, ShoppingBag } from 'lucide-react';
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
  navigation,
  paths,
  staffNavigation,
  type NavigationItem,
} from '../../app/routes';
import { Card, ErrorState, Loading, Tag } from '../../components/ui/primitives';
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
  if (!tenant.context) return <Navigate to={paths.account} replace />;
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
  if (!isManagementRole(role)) return <Navigate to={paths.staff} replace />;
  return (
    <div className="workspace-home">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('workspace.managementArea')}</p>
          <h1 tabIndex={-1}>{t('workspace.storeOverview')}</h1>
          <p>
            {tenant.context.organization.name}{' '}
            {t('workspace.manageYourStoreWithinYourPermissions')}
          </p>
        </div>
        <Tag tone="amber">{localize(roleLabels[role])}</Tag>
      </div>
      <Card className="workspace-intro">
        <ShieldCheck size={27} aria-hidden="true" />
        <div>
          <h2>{t('workspace.storeAndTeamInformationTogether')}</h2>
          <p>{t('workspace.customerAndStaffAreasAreSeparateFrom')}</p>
        </div>
        <Link className="button button-secondary" to={paths.staff}>
          {t('workspace.openStaffWorkspace')}
        </Link>
      </Card>
      <section aria-labelledby="management-tasks-title">
        <h2 id="management-tasks-title">{t('workspace.managementTools')}</h2>
        <TaskCards
          items={navigation.filter(
            (item) =>
              ![paths.dashboard, paths.account, paths.help, paths.setup].some(
                (path) => path === item.to,
              ),
          )}
        />
      </section>
      <div className="workspace-information-grid">
        <Card>
          <ShoppingBag aria-hidden="true" />
          <h2>{t('workspace.onlineStorefrontForCustomers')}</h2>
          <p>{t('workspace.customerEntrancesAndMenusAreSeparateFrom')}</p>
          <Link className="button button-secondary" to={paths.shop}>
            {t('workspace.viewOnlineStorefront')}
          </Link>
        </Card>
        <Card>
          <BookOpen aria-hidden="true" />
          <h2>{t('workspace.helpAndSystemStatus')}</h2>
          <p>
            {t('workspace.gettingStartedAndSystemConnectionInformationNot')}
          </p>
          <Link to={paths.help}>{t('landing.help')}</Link>
          <Link to={paths.system}>{t('workspace.checkSystemStatus')}</Link>
        </Card>
      </div>
    </div>
  );
}

export function StaffHomePage() {
  const { t, localize } = useLanguage();

  const tenant = useOrganization();
  if (!tenant.context) return null;
  const role = tenant.context.membership.role;
  return (
    <div className="workspace-home">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('workspace.staffWorkspace')}</p>
          <h1 tabIndex={-1}>{t('workspace.myWork')}</h1>
          <p>
            {tenant.context.organization.name} · {localize(roleLabels[role])}
          </p>
        </div>
        <Tag tone="amber">{localize(roleLabels[role])}</Tag>
      </div>
      <Card className="workspace-intro">
        <ShieldCheck size={27} aria-hidden="true" />
        <div>
          <h2>{t('workspace.chooseATaskForYourRole')}</h2>
          <p>{t('workspace.onlyAuthorizedToolsForYourCurrentOrganization')}</p>
        </div>
      </Card>
      <section aria-labelledby="staff-tasks-title">
        <h2 id="staff-tasks-title">{t('workspace.workTools')}</h2>
        <TaskCards
          items={staffNavigation.filter(
            (item) =>
              ![paths.staff, paths.account, paths.help].some(
                (path) => path === item.to,
              ),
          )}
        />
      </section>
      <Card>
        <h2>{t('workspace.accountAndHelp')}</h2>
        <p>{t('workspace.yourRoleIsAssignedByTheStore')}</p>
        <div className="tenant-actions">
          <Link className="button button-secondary" to={paths.account}>
            {t('workspace.myAccount')}
          </Link>
          <Link to={paths.help}>{t('landing.help')}</Link>
        </div>
      </Card>
    </div>
  );
}
