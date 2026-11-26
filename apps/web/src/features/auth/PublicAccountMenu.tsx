import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, LogIn } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useOptionalAuth } from '../../app/AuthProvider';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import {
  organizationRequest,
  type Organization,
} from '../../lib/organization-api';
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
        className="public-account-trigger"
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
  const stores = useQuery({
    queryKey: ['public-account', userId, 'managed-stores'],
    queryFn: ({ signal }) =>
      organizationRequest<Organization[]>('/organizations', { signal }),
    enabled: open && verified,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
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
        <span>{name || t('auth.myAccount')}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="public-account-panel">
        <strong>{name}</strong>
        <Link to={paths.account}>{t('auth.myAccount')}</Link>
        {open &&
          verified &&
          stores.isSuccess &&
          !stores.isFetching &&
          Array.isArray(stores.data) &&
          stores.data.some((store) => store.status === 'ACTIVE') && (
            <Link to={paths.workspace} onClick={clearGoogleReturn}>
              {t('auth.manageStore')}
            </Link>
          )}
        <button
          type="button"
          disabled={pending}
          onClick={() => void handleSignOut()}
        >
          {t('auth.signOut')}
        </button>
        {failed && <p role="alert">{t('auth.signOutFailed')}</p>}
      </div>
    </details>
  );
}
