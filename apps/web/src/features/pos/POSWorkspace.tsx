import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import type { UiMessage } from '../../i18n';
import { useLanguage } from '../../app/language';
import { useEffect, useState, useRef, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useWorkspaceNavigate as useNavigate } from '../../app/useWorkspaceNavigate';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { ContextSwitchers } from '../organization/OrganizationGate';
import { Brand, ErrorState, Loading } from '../../components/ui/primitives';
import {
  posRequest,
  type POSPage,
  type POSTerminal,
  type POSShift,
  type POSCart,
  type CartSummary,
} from '../../lib/pos-api';

import { WorkspaceContext } from './POSContext';
import { usePOS } from './POSContext';
import { workspaceHome } from '../../app/access';
import { businessArea } from '../../app/workspace-paths';
import { paths } from '../../app/routes';

export function POSWorkspace() {
  const { t } = useLanguage();

  const tenant = useOrganization();
  const { pathname } = useLocation();
  const { state } = useAuth();
  if (!tenant.context || !state.session) return null;
  return (
    <WorkspaceProvider
      key={`${state.session.user.id}:${tenant.context.organization.id}:${tenant.branchID}`}
      org={tenant.context.organization.id}
      user={state.session.user.id}
      branch={tenant.branchID}
      csrf={state.session.csrf_token}
    >
      <div className="pos-workspace catalog-page">
        <a className="skip-link" href="#main-content">
          {t('pos.skipToContent')}
        </a>
        <header className="pos-header">
          <LanguageSwitcher />
          <Link
            to={
              businessArea(pathname) === 'staff'
                ? paths.staff
                : workspaceHome(tenant.context.membership.role)
            }
          >
            {t('pos.backToWorkspace')}
          </Link>
          <Brand />
          <ContextSwitchers />
        </header>
        <nav className="pos-navigation" aria-label={t('pos.salesNavigation')}>
          <Link to="/pos">{t('pos.sellProducts')}</Link>
          <Link to="/pos/held-carts">
            {t('pos.heldCarts')} <span className="shortcut-badge">F4</span>
          </Link>
          <Link to="/pos/checkout">{t('pos.checkout')}</Link>
          <Link to="/pos/register/open">{t('pos.openShift')}</Link>
          <Link to="/pos/register/close">{t('pos.closeShift')}</Link>
          <Link to="/pos/register/history">{t('pos.shiftHistory')}</Link>
          <Link to="/pos/shifts">{t('pos.paymentReview')}</Link>
          <Link to="/sales">{t('pos.salesHistory')}</Link>
          <Link to="/receipts">{t('pos.receipts')}</Link>
          {tenant.can('online_orders.read') && (
            <Link to="/online-orders">{t('pos.onlineOrders')}</Link>
          )}
        </nav>
        <main id="main-content">
          <WorkspaceStatus />
          <Outlet />
        </main>
      </div>
    </WorkspaceProvider>
  );
}
function WorkspaceStatus() {
  const { t, localize, messageText } = useLanguage();

  const pos = usePOS();
  return (
    <>
      <div className="pos-context">
        <label>
          {t('pos.terminal')}
          <select
            aria-label={t('pos.activeTerminal')}
            value={pos.terminal?.id ?? ''}
            disabled={pos.busy}
            onChange={(event) => pos.setTerminal(event.target.value)}
          >
            <option value="" disabled>
              {t('pos.selectTerminal')}
            </option>
            {pos.terminals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.code}
              </option>
            ))}
          </select>
        </label>
        <span>
          {t('pos.cashier')} {pos.user.slice(0, 8)} ·{' '}
          {pos.shift ? t('pos.shiftOpen') : t('pos.youHaveNoOpenShift')}
        </span>
      </div>
      {pos.loading && <Loading>{t('pos.loadingTerminalsAndShifts')}</Loading>}
      {pos.error && (
        <ErrorState
          message={localize(pos.error ?? '')}
          retry={() => void pos.refresh()}
        />
      )}{' '}
      {pos.message && (
        <p className="notice" role="status">
          {messageText(pos.message)}
        </p>
      )}
    </>
  );
}
function WorkspaceProvider({
  org,
  user,
  branch,
  csrf,
  children,
}: {
  org: string;
  user: string;
  branch: string;
  csrf: string;
  children: ReactNode;
}) {
  const { t } = useLanguage();

  const tenant = useOrganization();
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [terminalID, setTerminalID] = useState('');
  const [cartID, setCartID] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const controller = useRef(new AbortController());
  const retryKeys = useRef(new Map<string, string>());
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    return () => current.abort();
  }, []);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<UiMessage>('');
  const key = ['tenant', user, org, 'pos', branch];
  const terminals = useQuery({
    queryKey: [...key, 'terminals'],
    queryFn: ({ signal }) =>
      posRequest<POSPage<POSTerminal>>(
        org,
        `/pos/terminals?branch_id=${branch}&status=ACTIVE`,
        { signal },
      ),
    enabled: !!branch,
  });
  const terminal =
    terminals.data?.items.find((item) => item.id === terminalID) ??
    terminals.data?.items[0];
  const shifts = useQuery({
    queryKey: [...key, 'shifts', terminal?.id],
    queryFn: ({ signal }) =>
      posRequest<POSPage<POSShift>>(
        org,
        `/pos/shifts?branch_id=${branch}&terminal_id=${terminal?.id}&status=OPEN`,
        { signal },
      ),
    enabled: !!terminal,
  });
  const shift = shifts.data?.items.find(
    (item) => item.cashier_id === user && item.status === 'OPEN',
  );
  const carts = useQuery({
    queryKey: [...key, 'carts', terminal?.id],
    queryFn: ({ signal }) =>
      posRequest<POSPage<CartSummary>>(
        org,
        `/pos/carts?branch_id=${branch}&terminal_id=${terminal?.id}&status=ACTIVE`,
        { signal },
      ),
    enabled: !!terminal,
  });
  const activeID = cartID || carts.data?.items[0]?.id;
  const cart = useQuery({
    queryKey: [...key, 'cart', activeID],
    queryFn: ({ signal }) =>
      posRequest<POSCart>(org, `/pos/carts/${activeID}`, { signal }),
    enabled: !!activeID,
  });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['tenant', user, org] });
  };
  const mutate = async <Result,>(
    path: string,
    body: object,
    method = 'POST',
    idempotency?: string,
  ): Promise<Result | undefined> => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    const current = controller.current;
    const fingerprint = `${method}:${path}:${JSON.stringify(body)}`;
    const requestKey =
      idempotency ?? retryKeys.current.get(fingerprint) ?? crypto.randomUUID();
    retryKeys.current.set(fingerprint, requestKey);
    try {
      const result = await posRequest<Result>(org, path, {
        method,
        body,
        csrf,
        key: requestKey,
        signal: current.signal,
      });
      if (current.signal.aborted) return;
      await refresh();
      if (current.signal.aborted) return;
      retryKeys.current.delete(fingerprint);
      return result;
    } catch (problem) {
      if (current.signal.aborted) return;
      setError(
        problem instanceof Error ? problem.message : t('pos.requestFailed'),
      );
      await refresh();
      return undefined;
    } finally {
      locked.current = false;
      if (!current.signal.aborted) setBusy(false);
    }
  };
  const failure = terminals.error ?? shifts.error ?? carts.error ?? cart.error;
  return (
    <WorkspaceContext.Provider
      value={{
        org,
        user,
        branch,
        csrf,
        terminals: terminals.data?.items ?? [],
        terminal,
        setTerminal: (id) => {
          setTerminalID(id);
          setCartID('');
          setError('');
          setMessage('');
          const entry = new URLSearchParams(location.search).get(
            'online_order',
          );
          navigate(
            entry ? `/pos?online_order=${encodeURIComponent(entry)}` : '/pos',
          );
        },
        shifts: shifts.data?.items ?? [],
        shift,
        cart: cart.data?.status === 'ACTIVE' ? cart.data : undefined,
        setCart: setCartID,
        busy,
        error: error || (failure instanceof Error ? failure.message : ''),
        message,
        setMessage,
        mutate,
        refresh,
        can: tenant.can,
        loading: terminals.isPending || shifts.isFetching || carts.isFetching,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
