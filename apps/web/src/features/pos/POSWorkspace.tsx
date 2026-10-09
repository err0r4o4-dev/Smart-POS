import { useState, useRef, type ReactNode } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
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

export function POSWorkspace() {
  const tenant = useOrganization();
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
          ข้ามไปเนื้อหา
        </a>
        <header className="pos-header">
          <Link to="/dashboard">กลับภาพรวม</Link>
          <Brand />
          <ContextSwitchers />
        </header>
        <nav className="pos-navigation" aria-label="เมนูขาย">
          <Link to="/pos">ขายสินค้า</Link>
          <Link to="/pos/held-carts">ตะกร้าพัก</Link>
          <Link to="/pos/checkout">ชำระเงิน</Link>
          <Link to="/pos/register/open">เปิดกะ</Link>
          <Link to="/pos/register/close">ปิดกะ</Link>
          <Link to="/pos/register/history">ประวัติกะ</Link>
          <Link to="/pos/shifts">ตรวจสอบการชำระเงิน</Link>
          <Link to="/sales">ประวัติขาย</Link>
          <Link to="/receipts">ใบเสร็จ</Link>
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
  const pos = usePOS();
  return (
    <>
      <div className="pos-context">
        <label>
          เครื่องขาย
          <select
            aria-label="เครื่องขายที่ใช้งาน"
            value={pos.terminal?.id ?? ''}
            disabled={pos.busy}
            onChange={(event) => pos.setTerminal(event.target.value)}
          >
            <option value="" disabled>
              เลือกเครื่องขาย
            </option>
            {pos.terminals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.code}
              </option>
            ))}
          </select>
        </label>
        <span>
          แคชเชียร์: {pos.user.slice(0, 8)} ·{' '}
          {pos.shift ? 'กะเปิดอยู่' : 'ยังไม่เปิดกะของคุณ'}
        </span>
      </div>
      {pos.loading && <Loading>กำลังโหลดเครื่องขายและกะ…</Loading>}
      {pos.error && (
        <ErrorState message={pos.error} retry={() => void pos.refresh()} />
      )}{' '}
      {pos.message && (
        <p className="notice" role="status">
          {pos.message}
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
  const tenant = useOrganization();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [terminalID, setTerminalID] = useState('');
  const [cartID, setCartID] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
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
    idempotency: string = crypto.randomUUID(),
  ): Promise<Result | undefined> => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await posRequest<Result>(org, path, {
        method,
        body,
        csrf,
        key: idempotency,
      });
      await refresh();
      return result;
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : 'ทำรายการไม่สำเร็จ',
      );
      await refresh();
      return undefined;
    } finally {
      locked.current = false;
      setBusy(false);
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
          navigate('/pos');
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
