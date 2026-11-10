import { useLanguage } from '../../app/language';
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  Minus,
  PackageOpen,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import { Button, Card, Loading } from '../../components/ui/primitives';
import { exactDecimal, MAX_LINE_QUANTITY, moneyText } from '../../lib/pos-api';
import {
  centsText,
  estimatedLine,
  newTrackingToken,
  StorefrontError,
  storefrontRequest,
  type OnlineOrder,
  type ShopOrderInput,
  type ShopQuote,
  type ShopSettings,
  readTableToken,
} from '../../lib/storefront-api';
import { ShopError } from './StorefrontPage';
import { useShopCart, type CartEntry } from './shop-cart';
import { ShopOrderSteps } from './ShopOrderSteps';

// Page-specific presentation only.
// Global header/footer, API, and tracking logic stay unchanged.
const palette = {
  navy: 'var(--text-primary)',
  muted: 'var(--text-secondary)',
  yellow: 'var(--primary)',
  pale: 'var(--primary-subtle)',
  border: 'var(--border)',
  price: 'var(--primary-strong)',
};

const copy = {
  th: {
    cart: 'ตะกร้าสินค้า',
    checkout: 'ตรวจสอบและยืนยันคำสั่งซื้อ',
    tracking: 'ติดตามออเดอร์',
    backCart: 'กลับไปตะกร้า',
    dining: 'รูปแบบการรับประทาน',
    takeaway: 'ซื้อกลับบ้าน',
    dineIn: 'ทานที่ร้าน',
    table: 'โต๊ะ',
    tableFirst: 'ต้องเปิดจาก QR โต๊ะ',
    tableChoose: 'ต้องเปิดจาก QR ที่โต๊ะ',
    tableDemo: 'ทานที่ร้านต้องเปิดหน้านี้จาก QR ที่โต๊ะ',
    tableSelected: 'โต๊ะที่เลือก',
    payment: 'สถานะการชำระเงิน',
    dineInPayment: 'ยังไม่ชำระเงิน ร้านจะตรวจสอบยอดหลังส่งออเดอร์',
    summary: 'สรุปคำสั่งซื้อ',
    items: 'รายการสินค้า',
    discount: 'ส่วนลด',
    lineTotal: 'ราคารวม',
    added: 'เพิ่มลงตะกร้าแล้ว',
    decrease: 'ลดจำนวน',
    increase: 'เพิ่มจำนวน',
    dineInDemo: 'สั่งอาหารที่โต๊ะ',
    demoNote: 'กรุณาเปิดหน้านี้จาก QR ที่โต๊ะเพื่อสั่งอาหาร',
    tableRequired: 'กรุณาเปิดหน้านี้จาก QR ที่โต๊ะเพื่อสั่งอาหาร',
    demoSuccess: 'พร้อมสั่งอาหารสำหรับโต๊ะ',
    demoNotSent: 'ยืนยันคำสั่งซื้อเพื่อส่งออเดอร์ไปยังร้าน',
    checkoutHint: 'ตรวจสอบรายการ ยอดล่าสุด และข้อมูลก่อนยืนยันคำสั่งซื้อ',
    priceReviewed: 'ยอดล่าสุดจากระบบร้าน',
    orderItems: 'รายการที่ตรวจสอบแล้ว',
    customer: 'ข้อมูลผู้สั่งซื้อ',
    pickup: 'รับสินค้าและชำระเงินที่ร้าน',
    orderWaiting: 'กำลังตรวจสอบยอดล่าสุด…',
  },
  en: {
    cart: 'Shopping cart',
    checkout: 'Review and confirm order',
    tracking: 'Track order',
    backCart: 'Back to cart',
    dining: 'Dining option',
    takeaway: 'Takeaway',
    dineIn: 'Dine in',
    table: 'Table',
    tableFirst: 'Open from a table QR',
    tableChoose: 'Open from a table QR',
    tableDemo: 'Dine-in ordering must start from a table QR code',
    tableSelected: 'Selected table',
    payment: 'Payment status',
    dineInPayment: 'Unpaid. The store will confirm the total after submission.',
    summary: 'Order summary',
    items: 'Products',
    discount: 'Discount',
    lineTotal: 'Line total',
    added: 'Added to cart',
    decrease: 'Decrease quantity',
    increase: 'Increase quantity',
    dineInDemo: 'Order at table',
    demoNote: 'Open this page from a table QR code to order dine-in.',
    tableRequired: 'Open this page from a table QR code to order dine-in.',
    demoSuccess: 'Ready to order for table',
    demoNotSent: 'Confirm the order to send it to the store.',
    checkoutHint:
      'Review the items, latest total and your details before confirming the order',
    priceReviewed: 'Latest total from the store',
    orderItems: 'Verified items',
    customer: 'Customer details',
    pickup: 'Pick up and pay at the store',
    orderWaiting: 'Checking the latest total…',
  },
} as const;

const card: CSSProperties = {
  boxSizing: 'border-box',
  minWidth: 0,
  borderRadius: 'var(--radius-card)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-card)',
};

const title: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  margin: '0 0 12px',
  fontSize: 17,
  fontWeight: 800,
  lineHeight: 1.5,
};

const pale: CSSProperties = {
  background: palette.pale,
  borderRadius: 'var(--radius-small)',
  padding: 14,
  marginBottom: 14,
};

const control: CSSProperties = {
  boxSizing: 'border-box',
  minHeight: 44,
  width: '100%',
  padding: '10px 12px',
  border: `1px solid ${palette.border}`,
  borderRadius: 'var(--radius-control)',
  background: 'var(--surface)',
  color: palette.navy,
  fontFamily: 'inherit',
  fontSize: 14,
  lineHeight: 1.45,
};

const action: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 9,
  minHeight: 46,
  width: '100%',
  padding: '10px 14px',
  border: 0,
  borderRadius: 'var(--radius-control)',
  background: palette.yellow,
  color: palette.navy,
  fontFamily: 'inherit',
  fontSize: 14,
  lineHeight: 1.5,
  fontWeight: 800,
  cursor: 'pointer',
};

const secondary: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 42,
  padding: '9px 15px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-control)',
  background: 'var(--surface)',
  color: palette.navy,
  textDecoration: 'none',
  fontFamily: 'inherit',
  fontSize: 14,
  lineHeight: 1.5,
  fontWeight: 700,
  cursor: 'pointer',
};

interface RequestIdentity {
  key: string;
  token: string;
}

type DiningType = 'takeaway' | 'dine-in' | 'delivery';
type ShopQuoteWithShipping = ShopQuote & { shipping_fee?: string };

interface CheckoutNavigationState {
  diningType?: DiningType;
  quote?: ShopQuoteWithShipping;
}

function pendingIdentity(slug: string): RequestIdentity | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(`shop-pending:${slug}`) ?? 'null',
    ) as RequestIdentity | null;

    return value &&
      /^[a-f0-9-]{36}$/.test(value.key) &&
      /^[a-f0-9]{64}$/.test(value.token)
      ? value
      : null;
  } catch {
    return null;
  }
}

function quantityText(value: bigint): string {
  return `${value / 1000n}.${(value % 1000n).toString().padStart(3, '0')}`;
}

function displayQuantity(quantity: string): string {
  const value = exactDecimal(quantity, 3);

  if (value === null) return quantity;

  const integer = value / 1000n;
  const decimal = value % 1000n;

  return decimal === 0n
    ? integer.toString()
    : `${integer}.${decimal.toString().padStart(3, '0').replace(/0+$/, '')}`;
}

export function ShopCartPage() {
  const { slug = '' } = useParams();
  const location = useLocation();
  return (
    <CartContents
      key={`${slug}:${location.pathname}:${location.search}`}
      slug={slug}
    />
  );
}

function CartContents({ slug }: { slug: string }) {
  const { t, language } = useLanguage();
  const ui = copy[language];
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const tableToken = readTableToken(searchParams.toString());
  const isCheckout = location.pathname.endsWith('/checkout');
  const baseShopPath = location.pathname.replace(/\/(?:cart|checkout)$/, '');
  const cartPath = `${baseShopPath}/cart${location.search}`;
  const shopPath = `${baseShopPath}${location.search}`;
  const navigate = useNavigate();
  const cart = useShopCart(slug);
  const navigationState = (location.state ??
    null) as CheckoutNavigationState | null;
  const requestedFulfillment = searchParams.get('fulfillment');
  const [diningType, setDiningType] = useState<DiningType>(
    navigationState?.diningType ??
      (tableToken
        ? 'dine-in'
        : requestedFulfillment === 'DELIVERY'
          ? 'delivery'
          : 'takeaway'),
  );
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [reviewedQuote, setReviewedQuote] =
    useState<ShopQuoteWithShipping | null>(navigationState?.quote ?? null);

  const checkoutParams = new URLSearchParams(searchParams);
  if (diningType === 'delivery') {
    checkoutParams.set('fulfillment', 'DELIVERY');
  } else {
    checkoutParams.delete('fulfillment');
  }
  const checkoutPath = `${baseShopPath}/checkout${
    checkoutParams.toString() ? `?${checkoutParams.toString()}` : ''
  }`;

  const [identity] = useState<RequestIdentity>(
    () =>
      pendingIdentity(slug) ?? {
        key: crypto.randomUUID(),
        token: newTrackingToken(),
      },
  );

  const [pending, setPending] = useState(() => pendingIdentity(slug) !== null);

  const [retryInput, setRetryInput] = useState<ShopOrderInput | null>(null);

  const [customer, setCustomer] = useState({
    customer_name: '',
    contact_phone: '',
    customer_note: '',
  });

  const [error, setError] = useState<unknown>(null);

  const shop = useQuery({
    queryKey: ['storefront', slug, 'settings'],
    queryFn: ({ signal }) =>
      storefrontRequest<ShopSettings & { delivery_enabled?: boolean }>(
        `/${slug}`,
        { signal },
      ),
    retry: false,
  });

  const quote = useMutation({
    mutationFn: () =>
      storefrontRequest<ShopQuoteWithShipping>(`/${slug}/quote`, {
        body: {
          ...(tableToken
            ? { fulfillment: 'PICKUP', table_token: tableToken }
            : diningType === 'delivery'
              ? { fulfillment: 'DELIVERY' }
              : {}),
          items: cart.items.map(({ variant_id, quantity }) => ({
            variant_id,
            quantity,
          })),
        },
      }),
    onSuccess: (result) => {
      setReviewedQuote(result);

      if (!isCheckout) {
        navigate(checkoutPath);
      }
    },
  });

  const trackingPath = `/shop/${slug}/orders/${identity.key}#access=${identity.token}`;

  const submission = useMutation({
    mutationFn: (input: ShopOrderInput) =>
      storefrontRequest<OnlineOrder>(`/${slug}/orders`, {
        body: input,
        key: identity.key,
      }),

    onSuccess: () => {
      cart.update([]);

      try {
        sessionStorage.removeItem(`shop-pending:${slug}`);
      } catch {
        setPending(false);
      }

      navigate(trackingPath, { replace: true });
    },

    onError: (problem) => {
      setError(problem);

      if (
        problem instanceof StorefrontError &&
        [
          'INVALID_INPUT',
          'PRICE_CHANGED',
          'INSUFFICIENT_STOCK',
          'STORE_CLOSED',
        ].includes(problem.code)
      ) {
        setPending(false);
        setRetryInput(null);
        quote.reset();
        void shop.refetch();
      }
    },
  });

  const recovery = useMutation({
    mutationFn: () =>
      storefrontRequest<OnlineOrder>(`/${slug}/track`, {
        body: {
          order_id: identity.key,
          access_token: identity.token,
        },
      }),

    onSuccess: () => {
      cart.update([]);

      try {
        sessionStorage.removeItem(`shop-pending:${slug}`);
      } catch {
        setPending(false);
      }

      navigate(trackingPath, { replace: true });
    },

    onError: (problem) => setError(problem),
  });

  const send = (input: ShopOrderInput) => {
    if (submission.isPending) return;

    try {
      sessionStorage.setItem(`shop-pending:${slug}`, JSON.stringify(identity));
    } catch {
      setError(new Error(t('storefront.theBrowserCouldNotSaveTheTracking')));
      return;
    }

    setPending(true);
    setRetryInput(input);
    setError(null);
    submission.mutate(input);
  };

  const resetReview = () => {
    quote.reset();
    setReviewedQuote(null);
    setError(null);
  };

  const selectDining = (mode: DiningType) => {
    if (mode !== diningType) {
      setDiningType(mode);
      resetReview();
    }
  };

  useEffect(() => {
    if (isCheckout) {
      try {
        window.scrollTo({ top: 0, behavior: 'auto' });
      } catch {
        // Ignore scrolling in non-browser test environments.
      }
    }
  }, [isCheckout]);

  // Existing pending-order recovery.
  if (pending) {
    return (
      <div className="shop-cart-page">
        <Card className="shop-checkout">
          <h1>
            {submission.isPending
              ? t('storefront.submittingOrder')
              : t('storefront.checkTheOriginalRequestBeforeResubmitting')}
          </h1>

          <p>
            {t('storefront.requestId')} <code>{identity.key}</code>
          </p>

          <p>{t('storefront.ifTheNetworkFailsTheOrderMay')}</p>

          {error != null && <ShopError error={error} />}

          <div className="shop-actions">
            <Button
              disabled={submission.isPending || recovery.isPending}
              onClick={() => recovery.mutate()}
            >
              {t('storefront.checkOrderResult')}
            </Button>

            {retryInput && (
              <Button
                className="button-secondary"
                disabled={submission.isPending || recovery.isPending}
                onClick={() => send(retryInput)}
              >
                {t('storefront.retryTheSameRequest')}
              </Button>
            )}

            {recovery.error instanceof StorefrontError &&
              recovery.error.status === 404 && (
                <Button
                  className="button-secondary"
                  onClick={() => {
                    setPending(false);
                    setError(null);
                    quote.reset();
                  }}
                >
                  {t('storefront.returnToReviewWithTheSameId')}
                </Button>
              )}
          </div>

          <p>{t('storefront.contactDetailsAreNotStoredInThe')}</p>
        </Card>
      </div>
    );
  }

  const busy = quote.isPending || submission.isPending;

  const valid =
    cart.items.length > 0 &&
    cart.items.every((item) => {
      const units = exactDecimal(item.quantity, 3);

      return (
        units !== null &&
        units > 0n &&
        units <= MAX_LINE_QUANTITY &&
        (!['COUNT', 'PACKAGING'].includes(item.unit_type) ||
          units % 1000n === 0n)
      );
    });

  const estimated = cart.items.reduce(
    (total, item) =>
      total + (estimatedLine(item.unit_price, item.quantity) ?? 0n),
    0n,
  );

  const reviewDisabled =
    busy ||
    !valid ||
    tableToken === null ||
    (diningType === 'dine-in' && !tableToken) ||
    !shop.data?.accepting_orders;
  const submitDisabled =
    busy ||
    !shop.data?.accepting_orders ||
    (diningType === 'delivery' && !deliveryAddress.trim());

  useEffect(() => {
    if (
      !isCheckout ||
      reviewedQuote ||
      quote.isPending ||
      !shop.data ||
      !valid ||
      tableToken === null ||
      (diningType === 'dine-in' && !tableToken)
    ) {
      return;
    }

    quote.mutate();
  }, [
    diningType,
    isCheckout,
    quote.isPending,
    reviewedQuote,
    shop.data,
    tableToken,
    valid,
  ]);

  const submitOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !reviewedQuote ||
      !isCheckout ||
      busy ||
      (diningType === 'dine-in' && !tableToken) ||
      tableToken === null ||
      (diningType === 'delivery' && !deliveryAddress.trim()) ||
      !valid ||
      !shop.data?.accepting_orders
    ) {
      return;
    }

    send({
      ...customer,
      items: cart.items.map(({ variant_id, quantity }) => ({
        variant_id,
        quantity,
      })),
      quote_id: reviewedQuote.quote_id,
      ...(tableToken
        ? { fulfillment: 'PICKUP', table_token: tableToken }
        : diningType === 'delivery'
          ? {
              fulfillment: 'DELIVERY',
              delivery_address: deliveryAddress.trim(),
            }
          : {}),
      access_token: identity.token,
    });
  };

  // PAGE 2: CHECKOUT
  if (isCheckout && !reviewedQuote) {
    return (
      <div className="shop-cart-page shop-review-page">
        <PageHeader
          heading={ui.checkout}
          backText={ui.backCart}
          onBack={() => navigate(cartPath)}
        />

        <ShopOrderSteps active={2} />

        {shop.isPending || quote.isPending ? (
          <Loading>{ui.orderWaiting}</Loading>
        ) : (
          <>
            {shop.error && (
              <ShopError error={shop.error} retry={() => void shop.refetch()} />
            )}
            {quote.error && (
              <ShopError error={quote.error} retry={() => quote.mutate()} />
            )}
            {!valid && (
              <p role="alert">
                {t('storefront.enterValidQuantitiesPiecePackProductsRequire')}
              </p>
            )}
            {diningType === 'dine-in' && !tableToken && (
              <p role="alert">{ui.tableRequired}</p>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => navigate(cartPath)}
          style={{ ...secondary, width: '100%' }}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {ui.backCart}
        </button>
      </div>
    );
  }

  const checkout =
    isCheckout && reviewedQuote ? (
      <div className="shop-cart-page shop-review-page">
        <PageHeader
          heading={ui.checkout}
          backText={ui.backCart}
          onBack={() => navigate(cartPath)}
        />

        <ShopOrderSteps active={2} />

        <p
          style={{
            margin: '6px 0 18px',
            fontSize: 14,
            color: palette.muted,
          }}
        >
          {ui.checkoutHint}
        </p>

        {shop.error && (
          <ShopError error={shop.error} retry={() => void shop.refetch()} />
        )}

        {error != null && <ShopError error={error} />}

        <div className="shop-review-layout">
          {/* VERIFIED ORDER */}
          <section
            style={{
              ...card,
              padding: 'var(--card-padding, 24px)',
            }}
          >
            <h2 style={title}>
              <ShoppingBag size={21} aria-hidden="true" />
              {ui.orderItems}
            </h2>

            {reviewedQuote.items.map((item) => (
              <div
                key={item.variant_id}
                style={{
                  borderBottom: `1px solid ${palette.border}`,
                  padding: '12px 0',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'start',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ overflowWrap: 'anywhere' }}>
                      {item.product_name}
                    </strong>

                    <div
                      style={{
                        fontSize: 13,
                        color: palette.muted,
                        marginTop: 3,
                      }}
                    >
                      {item.variant_name} · {displayQuantity(item.quantity)}{' '}
                      {item.unit}
                    </div>
                  </div>

                  <strong
                    style={{
                      color: palette.price,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ฿{moneyText(item.line_total)}
                  </strong>
                </div>
              </div>
            ))}

            <div
              style={{
                ...pale,
                marginTop: 18,
                marginBottom: 0,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <strong>{ui.priceReviewed}</strong>

              <h3
                style={{
                  color: palette.price,
                  fontSize: 24,
                  margin: 0,
                }}
              >
                ฿{moneyText(reviewedQuote.estimated_total)}
              </h3>
            </div>

            <p
              style={{
                margin: '11px 0 0',
                fontSize: 12,
                color: palette.muted,
              }}
            >
              {diningType === 'delivery'
                ? language === 'th'
                  ? 'ยอดรวมรวมค่าจัดส่งแล้ว ยังไม่รวมส่วนลด/รางวัลที่อาจใช้ได้ที่ POS'
                  : 'Total includes the quoted shipping fee. Excludes discounts / rewards that may apply at POS.'
                : t('storefront.excludesDiscountsRewardsThatMayApplyAt')}
            </p>

            <p
              style={{
                margin: '12px 0 0',
                fontSize: 13,
                color: palette.muted,
              }}
            >
              <Check
                size={16}
                aria-hidden="true"
                style={{
                  verticalAlign: 'middle',
                  marginRight: 6,
                }}
              />
              {language === 'th'
                ? 'ยังไม่ชำระเงิน ร้านจะตรวจสอบยอดหลังส่งคำสั่งซื้อ'
                : 'Unpaid. The store will confirm the total after submission.'}
            </p>
            {reviewedQuote.table_code && (
              <p>
                {t('storefront.tableLabel', { code: reviewedQuote.table_code })}
              </p>
            )}
            {diningType === 'delivery' && reviewedQuote.shipping_fee && (
              <p>
                {t('storefront.deliveryFeeLabel', {
                  amount: moneyText(reviewedQuote.shipping_fee),
                })}
              </p>
            )}
          </section>

          {/* CUSTOMER FORM */}
          <form
            className="shop-customer-form"
            onSubmit={submitOrder}
            style={{
              ...card,
              padding: 'var(--card-padding, 24px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--card-gap, 24px)',
            }}
          >
            <h2 style={{ ...title, marginBottom: 0 }}>{ui.customer}</h2>

            <label style={{ fontSize: 14, fontWeight: 600 }}>
              {t('storefront.pickupRecipientName')}
              <input
                style={control}
                required
                maxLength={200}
                autoComplete="name"
                value={customer.customer_name}
                onChange={(event) =>
                  setCustomer({
                    ...customer,
                    customer_name: event.target.value,
                  })
                }
              />
            </label>

            <label style={{ fontSize: 14, fontWeight: 600 }}>
              {t('storefront.contactPhone')}
              <input
                style={control}
                required
                type="tel"
                minLength={3}
                maxLength={30}
                autoComplete="tel"
                value={customer.contact_phone}
                onChange={(event) =>
                  setCustomer({
                    ...customer,
                    contact_phone: event.target.value,
                  })
                }
              />
            </label>

            {diningType === 'delivery' && (
              <label style={{ fontSize: 14, fontWeight: 600 }}>
                {language === 'th'
                  ? 'ที่อยู่จัดส่งโดยละเอียด'
                  : 'Detailed delivery address'}
                <textarea
                  rows={4}
                  required
                  maxLength={2000}
                  autoComplete="street-address"
                  placeholder={
                    language === 'th'
                      ? 'บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์'
                      : 'House number, street, district, province and postal code'
                  }
                  style={control}
                  value={deliveryAddress}
                  onChange={(event) => setDeliveryAddress(event.target.value)}
                />
              </label>
            )}

            <label style={{ fontSize: 14, fontWeight: 600 }}>
              {t('storefront.noteToStore')}
              <textarea
                rows={3}
                maxLength={1000}
                style={{
                  ...control,
                  resize: 'vertical',
                }}
                value={customer.customer_note}
                onChange={(event) =>
                  setCustomer({
                    ...customer,
                    customer_note: event.target.value,
                  })
                }
              />
            </label>

            <label
              className="shop-consent"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                fontSize: 13,
                fontWeight: 400,
                lineHeight: 1.65,
              }}
            >
              <input
                type="checkbox"
                required
                style={{
                  marginTop: 4,
                  flexShrink: 0,
                }}
              />
              {t('storefront.iUnderstandStockIsReservedAfterSuccessful')}
            </label>

            <p
              style={{
                margin: 0,
                fontSize: 12,
                lineHeight: 1.6,
                color: palette.muted,
              }}
            >
              {t('storefront.theStoreUsesYourNameAndPhone')}
            </p>

            <button
              className="shop-checkout-submit"
              type="submit"
              disabled={submitDisabled}
              style={{
                ...action,
                opacity: submitDisabled ? 0.6 : 1,
                cursor: submitDisabled ? 'not-allowed' : 'pointer',
              }}
            >
              {t('storefront.submitOrderUnpaid')}
              <ArrowRight size={18} aria-hidden="true" />
            </button>

            {shop.data && !shop.data.accepting_orders && (
              <p role="status">
                {t('storefront.theStoreHasTemporarilyPausedOrders')}
              </p>
            )}

            <button
              type="button"
              onClick={resetReview}
              style={{
                ...secondary,
                width: '100%',
              }}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {ui.backCart}
            </button>
          </form>
        </div>
      </div>
    ) : null;

  // PAGE 1: CART
  return (
    <>
      {checkout}
      <div className="shop-cart-page" hidden={isCheckout}>
        <PageHeader
          heading={t('pos.shoppingCart')}
          backText={t('storefront.chooseMoreProducts')}
          to={shopPath}
        />

        <ShopOrderSteps active={1} />

        {tableToken === null && (
          <p role="alert">{t('storefront.invalidTableLink')}</p>
        )}

        {shop.isPending && (
          <Loading>{t('storefront.checkingStoreStatus')}</Loading>
        )}

        {shop.error && (
          <ShopError error={shop.error} retry={() => void shop.refetch()} />
        )}

        {cart.items.length === 0 ? (
          <div
            style={{
              ...card,
              padding: 'var(--card-padding, 24px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              textAlign: 'center',
            }}
          >
            <ShoppingCart size={38} color={palette.muted} aria-hidden="true" />

            <h2 style={{ margin: 0 }}>{t('storefront.yourCartIsEmpty')}</h2>

            <Link to={shopPath} style={secondary}>
              {t('storefront.backToProducts')}
            </Link>
          </div>
        ) : (
          <div className="shop-cart-layout">
            {/* PRODUCTS */}
            <section
              className="shop-cart-products"
              aria-label={t('storefront.cartItems')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--card-gap, 24px)',
                minWidth: 0,
              }}
            >
              {cart.items.map((item) => (
                <CartLineItem
                  key={item.variant_id}
                  item={item}
                  busy={busy}
                  onUpdateQuantity={(quantity) => {
                    cart.update(
                      cart.items.map((entry) =>
                        entry.variant_id === item.variant_id
                          ? { ...entry, quantity }
                          : entry,
                      ),
                    );

                    resetReview();
                  }}
                  onRemove={() => {
                    cart.update(
                      cart.items.filter(
                        (entry) => entry.variant_id !== item.variant_id,
                      ),
                    );

                    resetReview();
                  }}
                />
              ))}
            </section>

            {/* ORDER SUMMARY */}
            <aside
              className="shop-cart-summary"
              style={{
                ...card,
                minWidth: 0,
                padding: 'var(--card-padding, 24px)',
              }}
            >
              {/* DINING OPTION */}
              <section style={{ marginBottom: 15 }}>
                <h2 style={title}>
                  <UtensilsCrossed size={21} aria-hidden="true" />
                  {ui.dining}
                </h2>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 9,
                  }}
                >
                  {(['takeaway', 'dine-in'] as const).map((mode) => (
                    <button
                      type="button"
                      key={mode}
                      aria-pressed={diningType === mode}
                      disabled={busy || (mode === 'takeaway' && !!tableToken)}
                      onClick={() => selectDining(mode)}
                      style={{
                        ...action,
                        minWidth: 0,
                        minHeight: 44,
                        fontSize: 13,
                        padding: '8px 6px',
                        border: `1px solid ${
                          diningType === mode ? palette.yellow : palette.border
                        }`,
                        background:
                          diningType === mode
                            ? palette.yellow
                            : 'var(--secondary)',
                        color:
                          diningType === mode ? palette.navy : palette.muted,
                      }}
                    >
                      {mode === 'takeaway' ? (
                        <ShoppingBag size={17} aria-hidden="true" />
                      ) : (
                        <UtensilsCrossed size={17} aria-hidden="true" />
                      )}
                      {mode === 'takeaway' ? ui.takeaway : ui.dineIn}
                    </button>
                  ))}
                  {!tableToken && shop.data?.delivery_enabled && (
                    <button
                      type="button"
                      aria-pressed={diningType === 'delivery'}
                      disabled={busy}
                      onClick={() => selectDining('delivery')}
                      style={{
                        ...action,
                        minWidth: 0,
                        minHeight: 44,
                        fontSize: 13,
                        padding: '8px 6px',
                        border: `1px solid ${diningType === 'delivery' ? palette.yellow : palette.border}`,
                        background:
                          diningType === 'delivery'
                            ? palette.yellow
                            : 'var(--secondary)',
                      }}
                    >
                      {language === 'th' ? 'จัดส่ง' : 'Delivery'}
                    </button>
                  )}
                </div>
              </section>

              {/* TABLE CONTEXT */}
              {!tableToken && diningType === 'dine-in' && (
                <section
                  className="shop-cart-table-section"
                  style={{
                    marginBottom: 15,
                    paddingBottom: 15,
                    borderBottom: `1px solid ${palette.border}`,
                  }}
                >
                  <h2 style={{ ...title, fontSize: 15, marginBottom: 8 }}>
                    <UtensilsCrossed size={19} aria-hidden="true" />
                    {ui.table}
                  </h2>

                  <p
                    role="status"
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: 'var(--primary-strong)',
                    }}
                  >
                    {ui.tableRequired}
                  </p>
                </section>
              )}

              {/* PAYMENT */}
              <section style={pale}>
                <h2 style={title}>
                  <CreditCard size={20} aria-hidden="true" />
                  {ui.payment}
                </h2>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      flexShrink: 0,
                      border: `4px solid ${palette.yellow}`,
                      background: palette.navy,
                      boxShadow: 'inset 0 0 0 3px white',
                    }}
                  />

                  <span>
                    {language === 'th'
                      ? 'ยังไม่ชำระเงิน ร้านจะตรวจสอบยอดหลังส่งคำสั่งซื้อ'
                      : 'Unpaid. The store will confirm the total after submission.'}
                  </span>
                </div>

                {diningType === 'takeaway' &&
                  !tableToken &&
                  shop.data?.pickup_instructions && (
                    <p
                      style={{
                        margin: '9px 0 0 30px',
                        color: palette.muted,
                        fontSize: 12,
                        overflowWrap: 'anywhere',
                        lineHeight: 1.5,
                      }}
                    >
                      {shop.data.pickup_instructions}
                    </p>
                  )}
              </section>

              {/* TOTALS */}
              <section
                style={{
                  borderTop: `1px solid ${palette.border}`,
                  paddingTop: 14,
                  marginBottom: 14,
                }}
              >
                <h2 style={title}>{ui.summary}</h2>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: 13,
                    marginBottom: 10,
                    color: palette.muted,
                  }}
                >
                  <span>
                    {ui.items} ({cart.items.length})
                  </span>

                  <span
                    style={{
                      whiteSpace: 'nowrap',
                      color: palette.navy,
                    }}
                  >
                    ฿{moneyText(centsText(estimated))}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: 13,
                    marginBottom: 12,
                    color: palette.muted,
                  }}
                >
                  <span>{ui.discount}</span>
                  <span>—</span>
                </div>

                <div
                  className="shop-cart-estimated-total"
                  style={{
                    marginBottom: 0,
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <strong style={{ fontSize: 13 }}>
                    {t('storefront.estimatedCartTotal')}
                  </strong>

                  <strong
                    style={{
                      color: palette.price,
                      fontSize: 23,
                    }}
                  >
                    ฿{moneyText(centsText(estimated))}
                  </strong>
                </div>
              </section>

              {/* ACTION BUTTON */}
              <button
                type="button"
                disabled={reviewDisabled}
                onClick={() => {
                  setError(null);
                  quote.mutate();
                }}
                style={{
                  ...action,
                  opacity: reviewDisabled ? 0.6 : 1,
                  cursor: reviewDisabled ? 'not-allowed' : 'pointer',
                }}
              >
                {quote.isPending
                  ? ui.orderWaiting
                  : t('storefront.reviewItemsAndLatestTotal')}
                <ArrowRight size={17} aria-hidden="true" />
              </button>

              {diningType === 'dine-in' && !tableToken && (
                <p
                  role="status"
                  style={{
                    margin: '10px 0 0',
                    fontSize: 12,
                    color: 'var(--primary-strong)',
                  }}
                >
                  {ui.tableRequired}
                </p>
              )}

              {shop.data && !shop.data.accepting_orders && (
                <p role="status">
                  {t('storefront.theStoreHasTemporarilyPausedOrders')}
                </p>
              )}

              {!valid && (
                <p role="alert">
                  {t('storefront.enterValidQuantitiesPiecePackProductsRequire')}
                </p>
              )}

              {quote.error && <ShopError error={quote.error} />}

              {error != null && <ShopError error={error} />}
            </aside>
          </div>
        )}
      </div>
    </>
  );
}

function PageHeader({
  heading,
  backText,
  to,
  onBack,
}: {
  heading: string;
  backText: string;
  to?: string;
  onBack?: () => void;
}) {
  const content = (
    <>
      <ArrowLeft size={17} aria-hidden="true" />
      {backText}
    </>
  );

  return (
    <div className="shop-page-heading">
      <h1>{heading}</h1>

      {to ? (
        <Link className="shop-secondary-action" to={to}>
          {content}
        </Link>
      ) : (
        <button
          className="shop-secondary-action"
          type="button"
          onClick={onBack}
        >
          {content}
        </button>
      )}
    </div>
  );
}

function CartLineItem({
  item,
  busy,
  onUpdateQuantity,
  onRemove,
}: {
  item: CartEntry;
  busy: boolean;
  onUpdateQuantity: (quantity: string) => void;
  onRemove: () => void;
}) {
  const { t, language } = useLanguage();
  const ui = copy[language];

  const [imageFailed, setImageFailed] = useState(false);
  const [quantityInput, setQuantityInput] = useState(() =>
    displayQuantity(item.quantity),
  );
  const [editing, setEditing] = useState(false);

  const isCount = ['COUNT', 'PACKAGING'].includes(item.unit_type);
  const amount = exactDecimal(item.quantity, 3);
  const step = isCount ? 1000n : 1n;
  const lineTotal = estimatedLine(item.unit_price, item.quantity);

  const changeBy = (delta: bigint) => {
    if (
      amount === null ||
      amount + delta * step <= 0n ||
      amount + delta * step > MAX_LINE_QUANTITY
    ) {
      return;
    }

    const value = quantityText(amount + delta * step);

    setEditing(false);
    setQuantityInput(displayQuantity(value));
    onUpdateQuantity(value);
  };

  const handleQuantityChange = (input: string) => {
    if (isCount ? !/^\d*$/.test(input) : !/^\d*(\.\d{0,3})?$/.test(input)) {
      return;
    }

    setEditing(true);
    setQuantityInput(input);

    if (input === '' || input === '.') return;

    const parsed = exactDecimal(isCount ? `${input}.000` : input, 3);

    if (parsed !== null && parsed > 0n && parsed <= MAX_LINE_QUANTITY) {
      onUpdateQuantity(quantityText(parsed));
    }
  };

  return (
    <article className="shop-cart-product">
      {/* PRODUCT IMAGE */}
      <div className="shop-cart-product-media">
        {item.image_url && !imageFailed ? (
          <img
            src={item.image_url}
            alt={item.product_name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              height: '100%',
              color: 'var(--text-tertiary)',
            }}
          >
            <PackageOpen size={32} aria-hidden="true" />
          </div>
        )}
      </div>

      {/* PRODUCT INFORMATION */}
      <div className="shop-cart-product-content">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                margin: '0 0 5px',
                fontSize: 'clamp(17px, 1.7vw, 20px)',
                lineHeight: 1.4,
                fontWeight: 800,
                overflowWrap: 'anywhere',
              }}
            >
              {item.product_name}
            </h2>

            {item.variant_name.trim() &&
              item.variant_name.trim().toLowerCase() !== 'default' && (
                <p
                  style={{
                    margin: '0 0 7px',
                    color: palette.muted,
                    fontSize: 13,
                  }}
                >
                  {item.variant_name}
                </p>
              )}

            <div
              style={{
                color: palette.price,
                fontSize: 21,
                fontWeight: 800,
              }}
            >
              ฿{moneyText(item.unit_price)}{' '}
              <span
                style={{
                  color: palette.muted,
                  fontSize: 12,
                  fontWeight: 400,
                }}
              >
                / {item.unit}
              </span>
            </div>
          </div>
        </div>

        {/* QUANTITY AND PRICE */}
        <div className="shop-cart-line-actions">
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            aria-label={`${language === 'th' ? 'ลบสินค้า' : 'Remove item'} ${item.product_name}`}
            className="shop-cart-remove-button"
          >
            <Trash2 size={16} aria-hidden="true" />
            {language === 'th' ? 'ลบสินค้า' : 'Remove'}
          </button>
          <div
            className="shop-cart-quantity-control"
            style={{
              display: 'inline-flex',
              minHeight: 42,
              border: `1px solid ${palette.border}`,
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              disabled={busy || amount === null || amount <= step}
              onClick={() => changeBy(-1n)}
              aria-label={`${ui.decrease}: ${item.product_name}`}
              className="shop-cart-quantity-button"
              style={{
                alignItems: 'center',
                display: 'inline-flex',
                justifyContent: 'center',
                width: 39,
                border: 0,
                background: 'var(--secondary)',
                color: palette.navy,
                cursor:
                  busy || amount === null || amount <= step
                    ? 'not-allowed'
                    : 'pointer',
              }}
            >
              <Minus size={17} aria-hidden="true" />
            </button>

            <label
              style={{
                display: 'flex',
                width: 50,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  overflow: 'hidden',
                  clipPath: 'inset(50%)',
                }}
              >
                {t('pos.quantity')} {item.product_name}
              </span>

              <input
                type="text"
                inputMode={isCount ? 'numeric' : 'decimal'}
                disabled={busy}
                value={editing ? quantityInput : displayQuantity(item.quantity)}
                onFocus={() => {
                  setEditing(true);
                  setQuantityInput(displayQuantity(item.quantity));
                }}
                onChange={(event) => handleQuantityChange(event.target.value)}
                onBlur={() => {
                  setEditing(false);
                  setQuantityInput(displayQuantity(item.quantity));
                }}
                style={{
                  boxSizing: 'border-box',
                  width: '100%',
                  height: 42,
                  border: 0,
                  borderLeft: `1px solid ${palette.border}`,
                  borderRight: `1px solid ${palette.border}`,
                  borderRadius: 0,
                  padding: '0 2px',
                  background: 'var(--surface)',
                  color: palette.navy,
                  fontFamily: 'inherit',
                  fontSize: 14,
                  textAlign: 'center',
                  fontWeight: 700,
                }}
              />
            </label>

            <button
              type="button"
              disabled={
                busy || amount === null || amount + step > MAX_LINE_QUANTITY
              }
              onClick={() => changeBy(1n)}
              aria-label={`${ui.increase}: ${item.product_name}`}
              className="shop-cart-quantity-button"
              style={{
                alignItems: 'center',
                display: 'inline-flex',
                justifyContent: 'center',
                width: 39,
                border: 0,
                background: 'var(--secondary)',
                color: palette.navy,
                cursor:
                  busy || amount === null || amount + step > MAX_LINE_QUANTITY
                    ? 'not-allowed'
                    : 'pointer',
              }}
            >
              <Plus size={17} aria-hidden="true" />
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 2,
              minWidth: 85,
            }}
          >
            <span
              style={{
                color: palette.muted,
                fontSize: 12,
              }}
            >
              {ui.lineTotal}
            </span>

            <strong
              style={{
                fontSize: 21,
                lineHeight: 1.2,
                color: palette.price,
                whiteSpace: 'nowrap',
              }}
            >
              ฿{moneyText(centsText(lineTotal ?? 0n))}
            </strong>
          </div>
        </div>
      </div>
    </article>
  );
}
