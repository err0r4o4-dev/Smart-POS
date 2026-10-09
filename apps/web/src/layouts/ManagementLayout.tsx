import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpen,
  ChevronDown,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  Store,
  Terminal,
  X,
} from 'lucide-react';
import { anonymousSession, canAccess } from '../app/access';
import { navigation } from '../app/routes';
import { Brand, Tag } from '../components/ui/primitives';
import { useAuth } from '../app/AuthProvider';
import { useOrganization } from '../app/OrganizationProvider';
import { ContextSwitchers } from '../features/organization/OrganizationGate';

const icons = {
  dashboard: LayoutDashboard,
  pos: Terminal,
  auth: ShieldCheck,
  help: BookOpen,
};
export function ManagementLayout() {
  const { state } = useAuth();
  const tenant = useOrganization();
  const access = tenant.context
    ? {
        authenticated: true as const,
        role: tenant.context.membership.role,
        permissions: tenant.context.permissions,
      }
    : anonymousSession;
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const location = useLocation();
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const close = () => {
    setOpen(false);
    menuButton.current?.focus();
  };
  return (
    <div className="management-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <NavLink to="/dashboard" aria-label="SmartPOS overview">
          <Brand />
        </NavLink>
        <div className="workspace-context">
          <span className="context-icon">
            <Store size={19} aria-hidden="true" />
          </span>
          <div>
            <strong>
              {tenant.context?.organization.name ?? 'Development workspace'}
            </strong>
            <small>
              {tenant.context?.branches.find(
                (item) => item.id === tenant.branchID,
              )?.name ?? 'No branch configured'}
            </small>
          </div>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {navigation
            .filter((item) => canAccess(access, item.permission, item.roles))
            .map((item) => {
              const Icon = icons[item.icon];
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? 'active' : ''}`
                  }
                >
                  <Icon size={20} aria-hidden="true" />
                  {item.label}
                </NavLink>
              );
            })}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-dot" />
          <strong>Built for what’s next</strong>
          <p>A thoughtful foundation for your retail operations.</p>
          <Tag tone="amber">Phase 0 · Foundation</Tag>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>
            <strong>
              {location.pathname === '/help' ? 'Getting started' : 'Overview'}
            </strong>
          </div>
          <div className="topbar-right">
            <Tag>Development</Tag>
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
          SmartPOS · Intelligent Retail Management
          <span>Foundation, not production</span>
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
              );
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
            <Brand />
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
          <nav id="mobile-navigation" aria-label="Mobile navigation">
            {navigation
              .filter((item) => canAccess(access, item.permission, item.roles))
              .map((item) => (
                <NavLink
                  className="nav-item"
                  key={item.to}
                  to={item.to}
                  onClick={close}
                >
                  {item.label}
                  <ChevronDown size={16} aria-hidden="true" />
                </NavLink>
              ))}
          </nav>
          <Tag tone="amber">Phase 0 · presentation only</Tag>
        </dialog>
      }
    </div>
  );
}
