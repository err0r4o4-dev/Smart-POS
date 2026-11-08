import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../../app/AuthProvider';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';

export function AccountMenu() {
  const { t, localize } = useLanguage();
  const { state, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [open]);

  if (state.status !== 'authenticated') {
    return (
      <NavLink
        to={paths.login}
        className="avatar"
        aria-label={t('auth.signIn')}
      >
        —
      </NavLink>
    );
  }

  const initial =
    state.session.user.display_name.trim().slice(0, 1).toUpperCase() || 'U';
  const isSettingsRoute =
    location.pathname === paths.settings ||
    location.pathname.startsWith(paths.settings + '/');

  const handleSignOut = async () => {
    setPending(true);
    setError('');
    try {
      await signOut?.();
      setOpen(false);
      navigate(paths.login, { replace: true });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t('auth.logoutUnavailable'),
      );
    } finally {
      setPending(false);
    }
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }

    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled])',
      ),
    );
    if (items.length === 0) return;

    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Home') {
      items[0]?.focus();
    } else if (event.key === 'End') {
      items[items.length - 1]?.focus();
    } else if (event.key === 'ArrowDown') {
      const nextIndex =
        currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      items[nextIndex]?.focus();
    } else if (event.key === 'ArrowUp') {
      const prevIndex =
        currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
      items[prevIndex]?.focus();
    }
  };

  return (
    <div className="account-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={
          'avatar account-menu-trigger' +
          (isSettingsRoute || open ? ' active' : '')
        }
        aria-label={t('auth.yourAccount')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-current={isSettingsRoute ? 'page' : undefined}
        onClick={() => {
          setError('');
          setOpen((prev) => !prev);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setError('');
            setOpen(true);
          }
        }}
      >
        <span className="avatar-initial">{initial}</span>
        <span className="avatar-status-dot" aria-hidden="true" />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('auth.yourAccount')}
          className="account-menu-dropdown"
          onKeyDown={handleMenuKeyDown}
        >
          <div className="account-menu-header">
            <span className="account-menu-avatar" aria-hidden="true">
              {initial}
            </span>
            <div className="account-menu-identity">
              <strong>{state.session.user.display_name}</strong>
              <small>{state.session.user.email}</small>
            </div>
          </div>

          <div className="account-menu-divider" role="separator" />

          <div className="account-menu-list">
            <NavLink
              to={paths.settings}
              role="menuitem"
              className={({ isActive }) =>
                'account-menu-item' + (isActive ? ' active' : '')
              }
              onClick={() => setOpen(false)}
            >
              <span className="account-menu-item-icon" aria-hidden="true">
                <Settings size={16} />
              </span>
              <span className="account-menu-item-label">
                {t('auth.settings')}
              </span>
              <ChevronRight
                size={14}
                className="account-menu-item-chevron"
                aria-hidden="true"
              />
            </NavLink>

            <button
              type="button"
              role="menuitem"
              className="account-menu-item account-menu-item-danger"
              disabled={pending}
              onClick={() => void handleSignOut()}
            >
              <span className="account-menu-item-icon" aria-hidden="true">
                <LogOut size={16} />
              </span>
              <span className="account-menu-item-label">
                {pending ? t('auth.signingOut') : t('auth.signOut')}
              </span>
            </button>
          </div>

          {error && (
            <p role="alert" className="account-menu-error">
              {localize(error)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
