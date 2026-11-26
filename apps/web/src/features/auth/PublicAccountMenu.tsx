import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogIn, LogOut, Store, UserRound } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useOptionalAuth } from '../../app/AuthProvider';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import { useStoreStatus } from '../../app/useStoreStatus';
import { authLink, clearGoogleReturn } from './auth-destination';
import './public-account.css';

export function PublicAccountMenu() {
  const auth = useOptionalAuth();
  const location = useLocation();
  const { t } = useLanguage();
  if (auth?.state.status === 'loading') return null;
  const session = auth?.state.session;
  if (!session)
    return (
      <Link
        className="public-account-trigger public-account-sign-in"
        to={authLink(paths.login, location.pathname + location.search)}
      >
        <LogIn size={17} aria-hidden="true" /> {t('auth.signIn')}
      </Link>
    );
  return (
    <AccountDisclosure
      key={`${session.user.id}:${location.key}`}
      name={session.user.display_name}
      userId={session.user.id}
      verified={session.user.email_verified === true}
      signOut={auth.signOut}
    />
  );
}

function AccountDisclosure({
  name,
  userId,
  verified,
  signOut,
}: {
  name: string;
  userId: string;
  verified: boolean;
  signOut: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const root = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const stores = useStoreStatus(verified ? userId : undefined);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        root.current?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const handleSignOut = async () => {
    if (pending) return;
    setFailed(false);
    setPending(true);
    try {
      await signOut();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <details
      className="public-account"
      ref={root}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !event.currentTarget.open) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.open = false;
        event.currentTarget.querySelector('summary')?.focus();
      }}
    >
      <summary
        role="button"
        className="public-account-trigger"
        aria-expanded={open}
      >
        <span className="public-account-avatar" aria-hidden="true">
          <UserRound size={16} />
        </span>
        <span className="public-account-name">
          {name || t('auth.myAccount')}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="public-account-panel">
        <strong className="account-menu-header">
          {name || t('auth.myAccount')}
        </strong>
        <Link to={paths.account} className="account-menu-item">
          <span className="account-menu-item-icon" aria-hidden="true">
            <UserRound size={16} />
          </span>
          <span>{t('auth.myAccount')}</span>
        </Link>
        {verified && stores.data?.hasStore && !stores.isError && (
            <Link
              to={paths.workspace}
              className="account-menu-item"
              onClick={clearGoogleReturn}
            >
              <span className="account-menu-item-icon" aria-hidden="true">
                <Store size={16} />
              </span>
              <span>{t('auth.manageStore')}</span>
            </Link>
          )}
        {verified && stores.isError && (
          <button
            type="button"
            className="account-menu-item"
            onClick={() => void stores.refetch()}
          >
            {t('landing.merchantCheckFailed')} {t('common.retry')}
          </button>
        )}
        <button
          type="button"
          className="account-menu-item account-menu-item-danger"
          disabled={pending}
          onClick={() => void handleSignOut()}
        >
          <span className="account-menu-item-icon" aria-hidden="true">
            <LogOut size={16} />
          </span>
          <span>{t('auth.signOut')}</span>
        </button>
        {failed && <p role="alert">{t('auth.signOutFailed')}</p>}
      </div>
    </details>
  );
}
