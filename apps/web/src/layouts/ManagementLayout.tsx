import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
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
    management: 'จัดการร้าน',
    staff: 'พื้นที่พนักงาน',
    account: 'บัญชีและการเข้าใช้งาน',
  }[area];
  const items =
    area === 'management'
      ? navigation
      : area === 'staff'
        ? staffNavigation
        : state.status === 'authenticated'
          ? accountNavigation
          : [
              {
                to: '/',
                label: 'หน้าหลักและทางเข้า',
                icon: 'dashboard' as const,
              },
              {
                to: paths.help,
                label: 'คู่มือการใช้งาน',
                icon: 'help' as const,
              },
              { to: paths.system, label: 'สถานะระบบ', icon: 'help' as const },
              {
                to: paths.login,
                label: 'เข้าสู่ระบบทีมร้าน',
                icon: 'auth' as const,
              },
            ];
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
    (location.pathname === paths.system ? 'สถานะระบบ' : areaTitle);
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
        Skip to content
      </a>
      <aside className="sidebar">
        <Link to="/" aria-label="VELO SmartPOS หน้าหลัก">
          <Brand />
        </Link>
        <div className="workspace-context">
          <span className="context-icon">
            <Store size={19} aria-hidden="true" />
          </span>
          <div>
            <strong>{tenant.context?.organization.name ?? 'SmartPOS'}</strong>
            <small>
              {tenant.context?.branches.find(
                (item) => item.id === tenant.branchID,
              )?.name ?? 'ยังไม่ได้เลือกสาขา'}
            </small>
          </div>
        </div>
        <div className="workspace-area-label">
          <strong>{areaTitle}</strong>
          <small>
            {role ? `บทบาท: ${roleLabels[role]}` : 'ยังไม่ได้เลือกพื้นที่ร้าน'}
          </small>
        </div>
        <nav className="sidebar-navigation" aria-label="Main navigation">
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
              ? 'จัดการข้อมูลและการตั้งค่าของร้านตามสิทธิ์ของคุณ'
              : area === 'staff'
                ? 'แสดงเฉพาะงานที่บทบาทของคุณได้รับอนุญาต'
                : 'บัญชีทีมร้านไม่ใช่บัญชีผู้ซื้อออนไลน์'}
          </p>
          <NavLink to="/">หน้าหลักและทางเข้า</NavLink>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            {areaTitle} <span>/</span>
            <strong>{pageTitle}</strong>
          </div>
          <div className="topbar-right">
            <Tag tone="amber">{role ? roleLabels[role] : 'ทีมร้าน'}</Tag>
            <NavLink to={paths.shop} className="workspace-area-link">
              ดูหน้าร้าน
            </NavLink>
            {role && isManagementRole(role) && (
              <NavLink
                to={area === 'staff' ? paths.dashboard : paths.staff}
                className="workspace-area-link"
              >
                {area === 'staff' ? 'จัดการร้าน' : 'พื้นที่พนักงาน'}
              </NavLink>
            )}
            <NavLink
              to={state.status === 'authenticated' ? '/account' : '/login'}
              className="avatar"
              aria-label={
                state.status === 'authenticated' ? 'Your account' : 'Sign in'
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
            aria-label="Open navigation"
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
          <span>หน้าร้านลูกค้าแยกจากพื้นที่ทีมร้าน</span>
        </footer>
      </div>
      {
        <dialog
          ref={dialog}
          className="mobile-dialog"
          aria-label="Navigation"
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
              <Link to="/" aria-label="VELO SmartPOS หน้าหลัก" onClick={close}>
                <Brand />
              </Link>
              <p>
                {areaTitle}
                {role ? ` · ${roleLabels[role]}` : ''}
              </p>
            </div>
            <button
              autoFocus
              className="icon-button"
              type="button"
              aria-label="Close navigation"
              onClick={close}
            >
              <X />
            </button>
          </div>
          <div className="mobile-workspace-links">
            <NavLink to="/" onClick={close}>
              หน้าหลักและทางเข้า
            </NavLink>
            <NavLink to={paths.shop} onClick={close}>
              หน้าร้านลูกค้า
            </NavLink>
            {role && isManagementRole(role) && (
              <NavLink
                to={area === 'staff' ? paths.dashboard : paths.staff}
                onClick={close}
              >
                {area === 'staff' ? 'จัดการร้าน' : 'พื้นที่พนักงาน'}
              </NavLink>
            )}
          </div>
          <nav id="mobile-navigation" aria-label="Mobile navigation">
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
