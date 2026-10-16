import { useLanguage } from '../../app/language';
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
} from '../../lib/payment-sandbox-api';

interface Draft {
  key: string;
  session: string;
}
const refundLabels = {
  pending: 'storefront.pending',
  requires_action: 'storefront.furtherActionRequiredInStripe',
  succeeded: 'storefront.succeeded',
  failed: 'storefront.failedReviewRequired',
  canceled: 'customers.cancel',
} as const;
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
  const { t } = useLanguage();

  const tenant = useOrganization();
  const { state } = useAuth();
  const org = tenant.context?.organization.id;
  const user = state.session?.user.id;
  if (!org || !user || !tenant.can('storefront.manage'))
    return <p role="alert">{t('storefront.youDoNotHavePermissionToTest')}</p>;
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
  const { t } = useLanguage();

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
          <p className="eyebrow">{t('storefront.onlinePaymentsSandbox')}</p>
          <h1>{t('storefront.testStripeConnection')}</h1>
        </div>
        <Link to="/settings/storefront">
          {t('storefront.backToStorefrontSettings')}
        </Link>
      </div>
      <p className="notice">{t('storefront.testModeOnlyNoRealFundsSales')}</p>
      {status.isPending && (
        <Loading>{t('storefront.checkingSandboxSettings')}</Loading>
      )}
      {error && <p role="alert">{message(error)}</p>}
      {invalidSession && (
        <p role="alert">
          {t('storefront.invalidTestSessionFormat')}{' '}
          <Button
            onClick={() => {
              const next = { key: crypto.randomUUID(), session: '' };
              setDraft(next);
              saveDraft(storageKey, next);
              setParams({}, { replace: true });
            }}
          >
            {t('storefront.restartWithoutThisSessionId')}
          </Button>
        </p>
      )}
      <Card>
        <h2>{t('storefront.connection')}</h2>
        <Tag tone={status.data?.configured ? 'success' : 'amber'}>
          {status.data?.configured
            ? t('storefront.testKeyConfigured')
            : t('storefront.notReadyToTest')}
        </Tag>
        {status.data?.configured === false && (
          <p>{t('storefront.setStripeTestSecretKeyAtThe')}</p>
        )}
        <p>{t('storefront.fixedTestAmountThb2000Cards')}</p>
        {!session && (
          <Button
            disabled={!status.data?.configured || !csrf || create.isPending}
            onClick={() => create.mutate()}
          >
            {t('storefront.createThb2000TestCheckout')}
          </Button>
        )}
        <Button
          className="button-secondary"
          disabled={status.isFetching}
          onClick={() => void status.refetch()}
        >
          {t('storefront.recheckSettings')}
        </Button>
      </Card>
      {session && !invalidSession && (
        <Card>
          <h2>{t('storefront.testSession')}</h2>
          <p>{session}</p>
          {checkout.isFetching && (
            <Loading>{t('storefront.checkingStatusWithStripe')}</Loading>
          )}
          {current && (
            <>
              <p>
                <Tag
                  tone={current.payment_status === 'paid' ? 'success' : 'amber'}
                >
                  {current.payment_status === 'paid'
                    ? t('storefront.testPaymentCompleted')
                    : current.status === 'expired'
                      ? t('storefront.sessionExpired')
                      : t('storefront.notPaidYet')}
                </Tag>
              </p>
              <p>{t('storefront.thb2000TestAmountThisStatus')}</p>
              {current.status === 'open' && current.url && (
                <a className="button" href={current.url} rel="noreferrer">
                  {t('storefront.openStripeTestCheckout')}
                </a>
              )}
              {currentRefund && (
                <p role="status">
                  {t('storefront.refund')}{' '}
                  {t(refundLabels[currentRefund.status])}
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
                    {t('storefront.confirmThb2000TestRefund')}
                  </label>
                  <Button
                    disabled={!confirmRefund || refund.isPending || !csrf}
                    onClick={() => refund.mutate()}
                  >
                    {t('storefront.requestFullTestRefund')}
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
            {t('storefront.refreshSessionStatus')}
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
              {t('storefront.startNewTestSession')}
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
