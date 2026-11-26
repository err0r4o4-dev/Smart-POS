import { useLanguage } from '../../app/language';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button, Card, Loading } from '../../components/ui/primitives';
import { storefrontRequest, type OnlineOrder } from '../../lib/storefront-api';
import { ShopError } from './StorefrontPage';
import { OrderDetails } from './OrderDetails';
import { ShopOrderSteps } from './ShopOrderSteps';
import { ArrowLeft } from 'lucide-react';

type PaymentState = 'REQUESTED' | 'OPEN' | 'PROCESSING' | 'EXPIRED' | 'PAID';
type PaymentStatus = {
  state: PaymentState;
  amount_minor: number;
  currency: 'thb';
  stock_hold_released?: boolean;
};
const returnLifetimeMs = 60 * 60 * 1000;
const returnKey = (slug: string, orderId: string) =>
  `shop-payment-return:${encodeURIComponent(slug)}:${encodeURIComponent(orderId)}`;
function paymentStatus(value: unknown): PaymentStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('ข้อมูลสถานะชำระเงินไม่ถูกต้อง');
  const data = value as Record<string, unknown>;
  if (
    typeof data.state !== 'string' ||
    !['REQUESTED', 'OPEN', 'PROCESSING', 'EXPIRED', 'PAID'].includes(
      data.state,
    ) ||
    !Number.isSafeInteger(data.amount_minor) ||
    (data.amount_minor as number) < 0 ||
    data.currency !== 'thb' ||
    (data.stock_hold_released !== undefined &&
      typeof data.stock_hold_released !== 'boolean')
  )
    throw new Error('ข้อมูลสถานะชำระเงินไม่ถูกต้อง');
  return data as PaymentStatus;
}
function checkoutUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('ลิงก์ชำระเงินไม่ถูกต้อง');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('ลิงก์ชำระเงินไม่ถูกต้อง');
  }
  if (
    url.protocol !== 'https:' ||
    url.host !== 'checkout.stripe.com' ||
    url.username ||
    url.password ||
    !/^\/c\/pay\/cs_test_[A-Za-z0-9]{1,220}$/.test(url.pathname)
  )
    throw new Error('ลิงก์ชำระเงินไม่ถูกต้อง');
  return url.href;
}

export function ShopTrackingPage() {
  const { slug = '', orderId = '' } = useParams();
  const { hash, search, pathname } = useLocation();
  const navigate = useNavigate();
  const token = new URLSearchParams(hash.slice(1)).get('access') ?? '';
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (
      hash ||
      params.getAll('payment_return').length !== 1 ||
      params.get('payment_return') !== '1'
    )
      return;
    try {
      const key = returnKey(slug, orderId);
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const saved: unknown = JSON.parse(raw);
      sessionStorage.removeItem(key);
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
      const data = saved as Record<string, unknown>;
      const now = Date.now();
      if (
        data.slug !== slug ||
        data.orderId !== orderId ||
        typeof data.token !== 'string' ||
        !/^[a-f0-9]{64}$/.test(data.token) ||
        typeof data.savedAt !== 'number' ||
        !Number.isFinite(data.savedAt) ||
        data.savedAt > now ||
        now - data.savedAt > returnLifetimeMs
      )
        return;
      params.delete('payment_return');
      const remaining = params.toString();
      void navigate(
        {
          pathname,
          search: remaining ? `?${remaining}` : '',
          hash: `#access=${data.token}`,
        },
        { replace: true },
      );
    } catch {
      // A missing or inaccessible session cannot restore a private tracking link.
    }
  }, [hash, search, pathname, slug, orderId, navigate]);
  return (
    <TrackingContents
      key={JSON.stringify([slug, orderId, token])}
      slug={slug}
      orderId={orderId}
      token={token}
    />
  );
}

function TrackingContents({
  slug,
  orderId,
  token,
}: {
  slug: string;
  orderId: string;
  token: string;
}) {
  const { t, language } = useLanguage();
  const valid = /^[a-f0-9]{64}$/.test(token);
  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [url, setUrl] = useState('');
  const [returnError, setReturnError] = useState(false);
  const order = useQuery({
    queryKey: ['storefront-tracking', slug, orderId, token],
    queryFn: ({ signal }) =>
      storefrontRequest<OnlineOrder>(`/${slug}/track`, {
        body: {
          order_id: orderId,
          access_token: token,
        },
        signal,
      }),
    enabled: valid,
    retry: false,
    refetchInterval: (query) =>
      query.state.data &&
      ['PENDING', 'PREPARING', 'READY'].includes(query.state.data.status)
        ? 15000
        : false,
    gcTime: 0,
  });
  const paymentAction = useMutation({
    mutationFn: async (action: 'checkout' | 'recover' | 'status') => {
      const result = await storefrontRequest<unknown>(
        `/${slug}/payment/${action}`,
        { body: { order_id: orderId, access_token: token } },
      );
      if (action === 'status')
        return { attempt: paymentStatus(result), url: '' };
      if (!result || typeof result !== 'object' || Array.isArray(result))
        throw new Error('ข้อมูลชำระเงินไม่ถูกต้อง');
      const data = result as Record<string, unknown>;
      const attempt = paymentStatus(data.attempt);
      if (data.url !== undefined && typeof data.url !== 'string')
        throw new Error('ลิงก์ชำระเงินไม่ถูกต้อง');
      const link = data.url ? checkoutUrl(data.url) : '';
      if (link) {
        let decoded: string;
        try {
          decoded = decodeURIComponent(link);
        } catch {
          throw new Error('ลิงก์ชำระเงินไม่ถูกต้อง');
        }
        if (decoded.toLowerCase().includes(token.toLowerCase()))
          throw new Error('ลิงก์ชำระเงินไม่ถูกต้อง');
      }
      if (link && (attempt.state !== 'OPEN' || attempt.stock_hold_released))
        throw new Error('ลิงก์ชำระเงินไม่ถูกต้อง');
      return { attempt, url: link };
    },
    onMutate: () => {
      setUrl('');
    },
    onSuccess: (result) => {
      setPayment(result.attempt);
      setUrl(result.url);
      if (result.attempt.state === 'PAID') void order.refetch();
    },
  });
  return (
    <div className="shop-tracking-page">
      <div className="shop-page-heading">
        <h1>{t('storefront.trackOrder')}</h1>

        <Link className="shop-secondary-action" to={`/shop/${slug}`}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t('storefront.backToStorefront')}
        </Link>
      </div>

      <ShopOrderSteps active={3} />

      <p className="notice shop-tracking-privacy">
        {language === 'th'
          ? 'เก็บลิงก์นี้เป็นส่วนตัว ผู้ที่มีลิงก์สามารถดูออเดอร์ได้'
          : 'Keep this link private. Anyone with it can view the order.'}
      </p>

      {!valid ? (
        <ShopError
          error={
            new Error(t('storefront.incompleteTrackingLinkUseTheLinkReceived'))
          }
        />
      ) : (
        <>
          {order.isPending && (
            <Loading>{t('storefront.checkingOrderStatus')}</Loading>
          )}

          {order.error && (
            <ShopError error={order.error} retry={() => void order.refetch()} />
          )}

          {order.data && (
            <Card className="shop-tracking-card">
              <OrderDetails order={order.data} />
              {order.data.status === 'PENDING' &&
                order.data.payment_status === 'UNPAID' && (
                  <section
                    className="shop-payment-panel"
                    aria-label={language === 'th' ? 'ชำระเงิน' : 'Payment'}
                  >
                    <div className="shop-actions">
                      <Button
                        disabled={
                          paymentAction.isPending ||
                          payment?.state === 'PAID' ||
                          payment?.stock_hold_released
                        }
                        onClick={() => paymentAction.mutate('checkout')}
                      >
                        {language === 'th' ? 'เริ่มชำระเงิน' : 'Start payment'}
                      </Button>
                      <Button
                        className="button-secondary"
                        disabled={
                          paymentAction.isPending ||
                          payment?.state === 'PAID' ||
                          payment?.stock_hold_released
                        }
                        onClick={() => paymentAction.mutate('recover')}
                      >
                        {language === 'th'
                          ? 'กู้คืนหน้าชำระเงิน'
                          : 'Recover checkout'}
                      </Button>
                      <Button
                        className="button-secondary"
                        disabled={paymentAction.isPending}
                        onClick={() => paymentAction.mutate('status')}
                      >
                        {language === 'th'
                          ? 'ตรวจสอบสถานะชำระเงิน'
                          : 'Check payment status'}
                      </Button>
                    </div>
                    {paymentAction.error && (
                      <ShopError error={paymentAction.error} />
                    )}
                    {payment && (
                      <p role="status">
                        {payment.state === 'PAID'
                          ? t('storefront.paymentStates.PAID')
                          : t('storefront.paymentStatusLabel', {
                              status: t(
                                `storefront.paymentStates.${payment.state}`,
                              ),
                            })}
                        {payment.stock_hold_released &&
                          (language === 'th'
                            ? ' · การกันสินค้าถูกปล่อยแล้ว กรุณาติดต่อร้าน'
                            : ' · Stock hold released. Contact the store.')}
                      </p>
                    )}
                    {url && (
                      <a
                        className="button"
                        href={url}
                        rel="noreferrer"
                        onClick={(event) => {
                          try {
                            sessionStorage.setItem(
                              returnKey(slug, orderId),
                              JSON.stringify({
                                slug,
                                orderId,
                                token,
                                savedAt: Date.now(),
                              }),
                            );
                            setReturnError(false);
                          } catch {
                            event.preventDefault();
                            setReturnError(true);
                          }
                        }}
                      >
                        {language === 'th' ? 'ไปหน้าชำระเงิน' : 'Go to payment'}
                      </a>
                    )}
                    {returnError && (
                      <p role="alert">
                        {language === 'th'
                          ? 'ไม่สามารถบันทึกลิงก์ติดตามในเบราว์เซอร์ กรุณาเปิดใช้งานที่เก็บข้อมูลแล้วลองใหม่'
                          : 'Unable to save the tracking link in this browser. Enable storage and try again.'}
                      </p>
                    )}
                  </section>
                )}
              <Button
                className="button-secondary"
                disabled={order.isFetching}
                onClick={() => void order.refetch()}
              >
                {t('storefront.refreshStatus')}
              </Button>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
