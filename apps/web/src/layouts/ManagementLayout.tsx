import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { useLanguage } from '../app/language';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, Store, X } from 'lucide-react';
import {
  anonymousSession,
  isManagementRole,
  roleLabels,
  type WorkspaceArea,
} from '../app/access';
import {
  accountNavigation,
  navigation,
  paths,
  staffNavigation,
  staffNavigationGroups,
  navigationGroups,
} from '../app/routes';
import { Brand, Tag } from '../components/ui/primitives';
import { useAuth } from '../app/AuthProvider';
import { useOrganization } from '../app/OrganizationProvider';
import { ContextSwitchers } from '../features/organization/OrganizationGate';
import { NavigationMenu } from './NavigationMenu';

export function ManagementLayout() {
  return <WorkspaceShell area="management" />;
}

export function WorkspaceShell({ area }: { area: WorkspaceArea }) {
  const { t, localize } = useLanguage();

  const { state } = useAuth();
  const tenant = useOrganization();
  const access =
    state.status === 'authenticated' &&
    !tenant.loading &&
    !tenant.error &&
    tenant.context
      ? {
          authenticated: true as const,
          role: tenant.context.membership.role,
          permissions: tenant.context.permissions,
        }
      : anonymousSession;
  const role = access.authenticated ? access.role : undefined;
  const areaTitle = {
    management: t('shell.storeManagement'),
    staff: t('workspace.staffWorkspace'),
    account: t('shell.accountAndAccess'),
  }[area];
  const rawItems =
    area === 'management'
      ? navigation
      : area === 'staff'
        ? staffNavigation
        : state.status === 'authenticated'
          ? accountNavigation
          : [
              {
                to: '/',
                label: t('shell.homeAndEntrances'),
                icon: 'dashboard' as const,
              },
              {
                to: paths.help,
                label: t('landing.help'),
                icon: 'help' as const,
              },
              {
                to: paths.system,
                label: t('shell.systemStatus'),
                icon: 'help' as const,
              },
              {
                to: paths.login,
                label: t('shell.storeTeamSignIn'),
                icon: 'auth' as const,
              },
            ];
  const items = rawItems
    .map((item) => ({ ...item, label: localize(item.label) }))
    .map((item) =>
      tenant.storeMode === 'single' && item.to === paths.setup
        ? {
            ...item,
            label:
              area === 'management'
                ? t('shell.enterStoreAcceptInvitation')
                : t('shell.acceptStoreInvitation'),
          }
        : item,
    );
  const groups =
    area === 'management'
      ? navigationGroups
      : area === 'staff'
        ? staffNavigationGroups
        : [];
  const homePath =
    area === 'management'
      ? paths.dashboard
      : area === 'staff'
        ? paths.staff
        : state.status === 'authenticated'
          ? paths.workspace
          : '/';
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const location = useLocation();
  const pageTitle =
    items
      .filter(
        (item) =>
          location.pathname === item.to ||
          location.pathname.startsWith(item.to + '/'),
      )
      .sort((left, right) => right.to.length - left.to.length)[0]?.label ??
    (location.pathname === paths.system ? t('shell.systemStatus') : areaTitle);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const close = () => {
    setOpen(false);
    menuButton.current?.focus();
  };
  return (
    <div className="management-shell" data-workspace={area}>
      <a className="skip-link" href="#main-content">
        {t('landing.skipToContent')}
      </a>
      <aside className="sidebar">
        <NavLink to={homePath} aria-label={`VELO SmartPOS · ${areaTitle}`}>
          <Brand />
        </NavLink>
        <div className="workspace-context">
          <span className="context-icon">
            <Store size={19} aria-hidden="true" />
          </span>
          <div>
            <strong>{tenant.context?.organization.name ?? 'SmartPOS'}</strong>
            <small>
              {tenant.context?.branches.find(
                (item) => item.id === tenant.branchID,
              )?.name ?? t('inventory.noBranchSelected')}
            </small>
          </div>
        </div>
        <div className="workspace-area-label">
          <strong>{areaTitle}</strong>
          <small>
            {role
              ? t('shell.roleValue0', { value0: localize(roleLabels[role]) })
              : t('shell.noStoreWorkspaceSelected')}
          </small>
        </div>
        <nav
          className="sidebar-navigation"
          aria-label={t('shell.mainNavigation')}
        >
          <NavigationMenu
            items={items}
            access={access}
            groups={groups}
            homePath={homePath}
          />
        </nav>
        <div className="sidebar-note">
          <strong>{areaTitle}</strong>
          <p>
            {area === 'management'
              ? t('shell.manageStoreDataAndSettingsWithinYour')
              : area === 'staff'
                ? t('shell.onlyTasksAllowedByYourRoleAre')
                : t('shell.storeTeamAccountsAreNotOnlineShopper')}
          </p>
          <NavLink to="/">{t('shell.homeAndEntrances')}</NavLink>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            {areaTitle} <span>/</span>
            <strong>{pageTitle}</strong>
          </div>
          <div className="topbar-right">
            <LanguageSwitcher />
            <Tag tone="amber">
              {role ? localize(roleLabels[role]) : t('shell.storeTeam')}
            </Tag>
            <NavLink to={paths.shop} className="workspace-area-link">
              {t('shell.viewStorefront')}
            </NavLink>
            {role && isManagementRole(role) && (
              <NavLink
                to={area === 'staff' ? paths.dashboard : paths.staff}
                className="workspace-area-link"
              >
                {area === 'staff'
                  ? t('shell.storeManagement')
                  : t('workspace.staffWorkspace')}
              </NavLink>
            )}
            <NavLink
              to={state.status === 'authenticated' ? '/account' : '/login'}
              className="avatar"
              aria-label={
                state.status === 'authenticated'
                  ? t('auth.yourAccount')
                  : t('auth.signIn')
              }
            >
              {state.status === 'authenticated'
                ? state.session.user.display_name.slice(0, 1).toUpperCase()
                : '—'}
            </NavLink>
          </div>
          <button
            ref={menuButton}
            type="button"
            className="icon-button mobile-menu"
            aria-label={t('shell.openNavigation')}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(true)}
          >
            <Menu />
          </button>
        </header>
        <main id="main-content" className="content">
          <ContextSwitchers />
          <Outlet />
        </main>
        <footer className="footer">
          SmartPOS · {areaTitle}
          <span>{t('shell.theCustomerStorefrontIsSeparateFromThe')}</span>
        </footer>
      </div>
      {
        <dialog
          ref={dialog}
          className="mobile-dialog"
          aria-label={t('shell.navigation')}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            }
            if (event.key === 'Tab') {
              const controls = Array.from(
                event.currentTarget.querySelectorAll<
                  HTMLButtonElement | HTMLAnchorElement
                >('button:not([disabled]), a[href]'),
              ).filter((control) => !control.closest('[hidden]'));
              const first = controls[0];
              const last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }
          }}
        >
          <div className="mobile-dialog-head">
            <div>
              <Brand />
              <p>
                {areaTitle}
                {role ? ` · ${localize(roleLabels[role])}` : ''}
              </p>
            </div>
            <button
              autoFocus
              className="icon-button"
              type="button"
              aria-label={t('shell.closeNavigation')}
              onClick={close}
            >
              <X />
            </button>
          </div>
          <div className="mobile-workspace-links">
            <NavLink to="/" onClick={close}>
              {t('shell.homeAndEntrances')}
            </NavLink>
            <NavLink to={paths.shop} onClick={close}>
              {t('shell.customerStorefront')}
            </NavLink>
            {role && isManagementRole(role) && (
              <NavLink
                to={area === 'staff' ? paths.dashboard : paths.staff}
                onClick={close}
              >
                {area === 'staff'
                  ? t('shell.storeManagement')
                  : t('workspace.staffWorkspace')}
              </NavLink>
            )}
          </div>
          <nav id="mobile-navigation" aria-label={t('shell.mobileNavigation')}>
            <NavigationMenu
              items={items}
              access={access}
              groups={groups}
              homePath={homePath}
              onNavigate={close}
            />
          </nav>
        </dialog>
      }
    </div>
  );
}
