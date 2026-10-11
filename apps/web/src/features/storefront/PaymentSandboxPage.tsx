import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { Button, Card, Loading, Tag } from '../../components/ui/primitives';
import {
  createSandboxCheckout,
  refundSandboxCheckout,
  sandboxCheckout,
  sandboxSessionPattern,
  sandboxStatus,
  type SandboxRefund,
} from '../../lib/payment-sandbox-api';

interface Draft {
  key: string;
  session: string;
}
const refundLabels: Record<SandboxRefund['status'], string> = {
  pending: 'รอดำเนินการ',
  requires_action: 'ต้องดำเนินการเพิ่มเติมใน Stripe',
  succeeded: 'สำเร็จ',
  failed: 'ไม่สำเร็จ ต้องตรวจสอบ',
  canceled: 'ยกเลิก',
};
function readDraft(storageKey: string): Draft {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(storageKey) ?? '{}',
    ) as Partial<Draft>;
    if (typeof value.key === 'string' && /^[a-f0-9-]{36}$/i.test(value.key))
      return {
        key: value.key,
        session:
          typeof value.session === 'string' &&
          sandboxSessionPattern.test(value.session)
            ? value.session
            : '',
      };
  } catch {
    return { key: crypto.randomUUID(), session: '' };
  }
  return { key: crypto.randomUUID(), session: '' };
}
function saveDraft(storageKey: string, draft: Draft) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(draft));
  } catch {
    return;
  }
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'เชื่อมต่อ Stripe sandbox ไม่ได้';

export function PaymentSandboxPage() {
  const tenant = useOrganization();
  const { state } = useAuth();
  const org = tenant.context?.organization.id;
  const user = state.session?.user.id;
  if (!org || !user || !tenant.can('storefront.manage'))
    return <p role="alert">ไม่มีสิทธิ์ทดสอบการชำระเงินของร้านนี้</p>;
  return (
    <SandboxPanel
      key={`${user}:${org}`}
      org={org}
      user={user}
      csrf={state.session?.csrf_token ?? ''}
    />
  );
}
function SandboxPanel({
  org,
  user,
  csrf,
}: {
  org: string;
  user: string;
  csrf: string;
}) {
  const [params, setParams] = useSearchParams();
  const storageKey = `smartpos-stripe-sandbox:${user}:${org}`;
  const [draft, setDraft] = useState(() => readDraft(storageKey));
  const [confirmRefund, setConfirmRefund] = useState(false);
  const session = params.get('session_id') ?? draft.session;
  const invalidSession = !!session && !sandboxSessionPattern.test(session);
  const status = useQuery({
    queryKey: ['tenant', user, org, 'stripe-sandbox', 'status'],
    queryFn: ({ signal }) => sandboxStatus(org, signal),
    retry: false,
  });
  const checkout = useQuery({
    queryKey: ['tenant', user, org, 'stripe-sandbox', session],
    queryFn: ({ signal }) => sandboxCheckout(org, session, signal),
    enabled: status.data?.configured === true && !!session && !invalidSession,
    retry: false,
  });
  const create = useMutation({
    mutationFn: () => {
      saveDraft(storageKey, draft);
      return createSandboxCheckout(org, csrf, draft.key);
    },
    onSuccess: (value) => {
      const next = { ...draft, session: value.id };
      setDraft(next);
      saveDraft(storageKey, next);
      setParams({ session_id: value.id }, { replace: true });
    },
  });
  const refund = useMutation({
    mutationFn: () => refundSandboxCheckout(org, csrf, session),
    onSuccess: () => {
      setConfirmRefund(false);
      void checkout.refetch();
    },
  });
  const current = checkout.data;
  const currentRefund = current?.refund ?? refund.data;
  const error = status.error ?? checkout.error ?? create.error ?? refund.error;
  return (
    <div className="catalog-page online-admin">
      <div className="shop-heading">
        <div>
          <p className="eyebrow">การชำระเงินออนไลน์ · Sandbox</p>
          <h1>ทดสอบการเชื่อมต่อ Stripe</h1>
        </div>
        <Link to="/settings/storefront">กลับตั้งค่าหน้าร้าน</Link>
      </div>
      <p className="notice">
        โหมดทดสอบเท่านั้น ไม่รับเงินจริง ไม่สร้างยอดขาย ไม่ตัดหรือกันสต็อก
        และไม่เปลี่ยนออเดอร์ลูกค้า การชำระออนไลน์สำหรับลูกค้ายังไม่เปิดใช้งาน
      </p>
      {status.isPending && <Loading>กำลังตรวจการตั้งค่า sandbox…</Loading>}
      {error && <p role="alert">{message(error)}</p>}
      {invalidSession && (
        <p role="alert">
          รูปแบบรายการทดสอบไม่ถูกต้อง{' '}
          <Button
            onClick={() => {
              const next = { key: crypto.randomUUID(), session: '' };
              setDraft(next);
              saveDraft(storageKey, next);
              setParams({}, { replace: true });
            }}
          >
            เริ่มใหม่โดยไม่ใช้เลขรายการนี้
          </Button>
        </p>
      )}
      <Card>
        <h2>การเชื่อมต่อ</h2>
        <Tag tone={status.data?.configured ? 'success' : 'amber'}>
          {status.data?.configured
            ? 'ตั้งค่า test key แล้ว'
            : 'ยังไม่พร้อมทดสอบ'}
        </Tag>
        {status.data?.configured === false && (
          <p>
            ตั้งค่า STRIPE_TEST_SECRET_KEY ที่ API ด้วย secret key ของ Stripe
            sandbox เท่านั้น ห้ามใส่ key ในหน้าเว็บหรือส่งผ่านแชต
          </p>
        )}
        <p>
          รายการทดสอบคงที่ 20.00 บาท · บัตร / PromptPay ตามที่บัญชีทดสอบรองรับ
          ใช้เฉพาะข้อมูลทดสอบที่ Stripe กำหนด
        </p>
        {!session && (
          <Button
            disabled={!status.data?.configured || !csrf || create.isPending}
            onClick={() => create.mutate()}
          >
            สร้าง Checkout ทดสอบ 20.00 บาท
          </Button>
        )}
        <Button
          className="button-secondary"
          disabled={status.isFetching}
          onClick={() => void status.refetch()}
        >
          ตรวจการตั้งค่าใหม่
        </Button>
      </Card>
      {session && !invalidSession && (
        <Card>
          <h2>รายการทดสอบ</h2>
          <p>{session}</p>
          {checkout.isFetching && <Loading>กำลังตรวจสถานะจาก Stripe…</Loading>}
          {current && (
            <>
              <p>
                <Tag
                  tone={current.payment_status === 'paid' ? 'success' : 'amber'}
                >
                  {current.payment_status === 'paid'
                    ? 'ชำระเงินทดสอบแล้ว'
                    : current.status === 'expired'
                      ? 'รายการหมดอายุ'
                      : 'ยังไม่ชำระ'}
                </Tag>
              </p>
              <p>
                ยอดทดสอบ 20.00 บาท สถานะนี้อ่านจาก Stripe ไม่ใช่จากข้อความใน URL
              </p>
              {current.status === 'open' && current.url && (
                <a className="button" href={current.url} rel="noreferrer">
                  เปิดหน้าชำระเงินทดสอบของ Stripe
                </a>
              )}
              {currentRefund && (
                <p role="status">
                  คืนเงิน: {refundLabels[currentRefund.status]}
                </p>
              )}
              {current.payment_status === 'paid' && !currentRefund && (
                <div>
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmRefund}
                      onChange={(event) =>
                        setConfirmRefund(event.target.checked)
                      }
                    />{' '}
                    ยืนยันคืนเงินทดสอบ 20.00 บาท
                  </label>
                  <Button
                    disabled={!confirmRefund || refund.isPending || !csrf}
                    onClick={() => refund.mutate()}
                  >
                    ขอคืนเงินทดสอบเต็มจำนวน
                  </Button>
                </div>
              )}
            </>
          )}
          <Button
            className="button-secondary"
            disabled={
              !status.data?.configured ||
              checkout.isFetching ||
              refund.isPending
            }
            onClick={() => void checkout.refetch()}
          >
            ตรวจสถานะรายการใหม่
          </Button>
          {(current?.status === 'complete' ||
            current?.status === 'expired') && (
            <Button
              className="button-secondary"
              disabled={refund.isPending}
              onClick={() => {
                const next = { key: crypto.randomUUID(), session: '' };
                setDraft(next);
                saveDraft(storageKey, next);
                setConfirmRefund(false);
                create.reset();
                refund.reset();
                setParams({}, { replace: true });
              }}
            >
              เริ่มรายการทดสอบใหม่
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
