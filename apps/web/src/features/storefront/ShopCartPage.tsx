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
    checkout: 'ยืนยันคำสั่งซื้อ',
    tracking: 'ติดตามออเดอร์',
    backCart: 'กลับไปตะกร้า',
    dining: 'รูปแบบการรับประทาน',
    takeaway: 'ซื้อกลับบ้าน',
    dineIn: 'ทานที่ร้าน',
    table: 'โต๊ะ',
    tableFirst: 'เลือกทานที่ร้านก่อน',
    tableChoose: 'เลือกโต๊ะ (ตัวอย่าง)',
    tableDemo: 'โต๊ะเป็นข้อมูลตัวอย่าง ยังไม่เชื่อมต่อระบบร้าน',
    tableSelected: 'โต๊ะที่เลือก',
    payment: 'วิธีการชำระเงิน',
    dineInPayment: 'ชำระเงินที่ร้าน (UI ตัวอย่าง)',
    summary: 'สรุปคำสั่งซื้อ',
    items: 'รายการสินค้า',
    discount: 'ส่วนลด',
    lineTotal: 'ราคารวม',
    added: 'เพิ่มลงตะกร้าแล้ว',
    decrease: 'ลดจำนวน',
    increase: 'เพิ่มจำนวน',
    dineInDemo: 'สั่งอาหารทานที่ร้าน (ตัวอย่าง)',
    demoNote: 'โหมดทานที่ร้านเป็นตัวอย่าง UI ยังไม่ส่งออเดอร์จริง',
    tableRequired: 'กรุณาเลือกโต๊ะก่อน',
    demoSuccess: 'ทดลองเลือกสั่งอาหารสำหรับโต๊ะ',
    demoNotSent: 'ยังไม่มีการส่งออเดอร์ไปยังร้าน',
    checkoutHint: 'ตรวจสอบยอดล่าสุดและกรอกข้อมูลก่อนส่งคำสั่งซื้อ',
    priceReviewed: 'ยอดล่าสุดจากระบบร้าน',
    orderItems: 'รายการที่ตรวจสอบแล้ว',
    customer: 'ข้อมูลผู้รับสินค้า',
    pickup: 'รับสินค้าและชำระเงินที่ร้าน',
    orderWaiting: 'กำลังตรวจสอบยอดล่าสุด...',
  },
  en: {
    cart: 'Shopping cart',
    checkout: 'Confirm order',
    tracking: 'Track order',
    backCart: 'Back to cart',
    dining: 'Dining option',
    takeaway: 'Takeaway',
    dineIn: 'Dine in',
    table: 'Table',
    tableFirst: 'Select dine in first',
    tableChoose: 'Choose a table (demo)',
    tableDemo: 'Sample tables only; not connected to the restaurant',
    tableSelected: 'Selected table',
    payment: 'Payment method',
    dineInPayment: 'Pay at restaurant (UI demo)',
    summary: 'Order summary',
    items: 'Products',
    discount: 'Discount',
    lineTotal: 'Line total',
    added: 'Added to cart',
    decrease: 'Decrease quantity',
    increase: 'Increase quantity',
    dineInDemo: 'Dine-in order (demo)',
    demoNote: 'Dine-in is a UI demo. No real order will be placed.',
    tableRequired: 'Please choose a table first',
    demoSuccess: 'Demo order selected for table',
    demoNotSent: 'No order was sent to the store',
    checkoutHint:
      'Review the latest total and provide your details before placing an order',
    priceReviewed: 'Latest total from the store',
    orderItems: 'Verified items',
    customer: 'Pickup details',
    pickup: 'Pick up and pay at the store',
    orderWaiting: 'Checking the latest total...',
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

const tables = [
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'A6',
  'A7',
  'A8',
  'A9',
  'A10',
  'A11',
  'A12',
];

interface RequestIdentity {
  key: string;
  token: string;
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
  const { search } = useLocation();
  return <CartContents key={`${slug}:${search}`} slug={slug} />;
}

function CartContents({ slug }: { slug: string }) {
  const { t, language } = useLanguage();
  const ui = copy[language];
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const tableToken = readTableToken(searchParams.toString());
  const shopPath = location.pathname.replace(/\/cart$/, '') + location.search;
  const navigate = useNavigate();
  const cart = useShopCart(slug);
  const [diningType, setDiningType] = useState<
    'takeaway' | 'dine-in' | 'delivery'
  >(tableToken ? 'dine-in' : 'takeaway');
  const [deliveryAddress, setDeliveryAddress] = useState('');

  const [selectedTable, setSelectedTable] = useState('');
  const [demoTable, setDemoTable] = useState<string | null>(null);

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
      storefrontRequest<ShopQuote & { shipping_fee?: string }>(
        `/${slug}/quote`,
        {
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
        },
      ),
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

  const send = (input: ShopOrderInput & { delivery_address?: string }) => {
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
    setDemoTable(null);
    setError(null);
  };

  const selectDining = (mode: 'takeaway' | 'dine-in' | 'delivery') => {
    if (mode !== diningType) {
      setDiningType(mode);

      if (mode === 'takeaway') {
        setSelectedTable('');
      }

      resetReview();
    }
  };

  const checkoutOpen =
    (diningType !== 'dine-in' || !!tableToken) && !!quote.data;

  useEffect(() => {
    if (checkoutOpen) {
      try {
        window.scrollTo({ top: 0, behavior: 'auto' });
      } catch {
        // Ignore scrolling in non-browser test environments.
      }
    }
  }, [checkoutOpen]);

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

  const submitOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !quote.data ||
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
      quote_id: quote.data.quote_id,
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
  const checkout = checkoutOpen ? (
    <div className="shop-cart-page shop-review-page">
      <PageHeader
        heading={ui.checkout}
        backText={ui.backCart}
        onBack={resetReview}
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

          {quote.data.items.map((item) => (
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
              ฿{moneyText(quote.data.estimated_total)}
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
              ? 'ตรวจสอบการชำระเงินหลังส่งออเดอร์'
              : 'Check payment after submitting the order'}
          </p>
          {quote.data.table_code && (
            <p>{t('storefront.tableLabel', { code: quote.data.table_code })}</p>
          )}
          {diningType === 'delivery' && quote.data.shipping_fee && (
            <p>
              {t('storefront.deliveryFeeLabel', {
                amount: moneyText(quote.data.shipping_fee),
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
              {language === 'th' ? 'ที่อยู่จัดส่ง' : 'Delivery address'}
              <input
                required
                maxLength={2000}
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
            type="submit"
            disabled={
              busy ||
              !shop.data?.accepting_orders ||
              (diningType === 'delivery' && !deliveryAddress.trim())
            }
            style={{
              ...action,
              opacity: busy || !shop.data?.accepting_orders ? 0.6 : 1,
              cursor:
                busy || !shop.data?.accepting_orders
                  ? 'not-allowed'
                  : 'pointer',
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
      <div className="shop-cart-page" hidden={checkoutOpen}>
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

        {/* CART NOTICE */}
        <div
          role="note"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 13,
            margin: '15px 0 20px',
            padding: '12px 15px',
            background: palette.pale,
            border: '1px solid var(--primary-border)',
            borderRadius: 11,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              width: 38,
              height: 38,
              flexShrink: 0,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              background: palette.yellow,
            }}
          >
            <ShoppingCart size={20} aria-hidden="true" />
          </span>

          <span
            style={{
              color: 'var(--primary-strong)',
              fontSize: 13,
            }}
          >
            {t('storefront.cartItemsAreNotReservedStockIs')}
          </span>
        </div>

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

              {/* TABLE SELECTION */}
              {!tableToken && diningType === 'dine-in' && (
                <section
                  className="shop-cart-table-section"
                  style={{
                    marginBottom: 15,
                    paddingBottom: 15,
                    borderBottom: `1px solid ${palette.border}`,
                  }}
                >
                  <label
                    htmlFor="shop-cart-table"
                    style={{
                      ...title,
                      fontSize: 15,
                      marginBottom: 8,
                    }}
                  >
                    <UtensilsCrossed size={19} aria-hidden="true" />
                    {ui.table}
                  </label>

                  <select
                    id="shop-cart-table"
                    value={selectedTable}
                    disabled={diningType !== 'dine-in'}
                    onChange={(event) => {
                      setSelectedTable(event.target.value);
                      setDemoTable(null);
                    }}
                    style={{
                      ...control,
                      color:
                        diningType === 'dine-in'
                          ? palette.navy
                          : 'var(--text-tertiary)',
                      background:
                        diningType === 'dine-in'
                          ? 'var(--surface)'
                          : 'var(--secondary)',
                      cursor:
                        diningType === 'dine-in' ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <option value="">
                      {diningType === 'dine-in'
                        ? ui.tableChoose
                        : ui.tableFirst}
                    </option>

                    {tables.map((table) => (
                      <option key={table} value={table}>
                        {ui.table} {table}
                      </option>
                    ))}
                  </select>

                  {diningType === 'dine-in' && (
                    <p
                      style={{
                        margin: '8px 0 0',
                        fontSize: 12,
                        color: 'var(--primary-strong)',
                      }}
                    >
                      {selectedTable
                        ? `${ui.tableSelected}: ${selectedTable} (${
                            language === 'th' ? 'ตัวอย่าง UI' : 'UI demo'
                          })`
                        : ui.tableDemo}
                    </p>
                  )}
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
                      ? 'ตรวจสอบการชำระเงินหลังส่งออเดอร์'
                      : 'Check payment after submitting the order'}
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
              {diningType !== 'dine-in' || !!tableToken ? (
                <button
                  type="button"
                  disabled={
                    busy ||
                    !valid ||
                    tableToken === null ||
                    !shop.data?.accepting_orders
                  }
                  onClick={() => {
                    setError(null);
                    quote.mutate();
                  }}
                  style={{
                    ...action,
                    opacity:
                      busy || !valid || !shop.data?.accepting_orders ? 0.6 : 1,
                  }}
                >
                  {quote.isPending
                    ? ui.orderWaiting
                    : t('storefront.reviewItemsAndLatestTotal')}
                  <ArrowRight size={17} aria-hidden="true" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy || !valid || !selectedTable}
                    onClick={() => setDemoTable(selectedTable)}
                    style={{
                      ...action,
                      opacity: busy || !valid || !selectedTable ? 0.6 : 1,
                      cursor:
                        busy || !valid || !selectedTable
                          ? 'not-allowed'
                          : 'pointer',
                    }}
                  >
                    <UtensilsCrossed size={17} aria-hidden="true" />
                    {ui.dineInDemo}
                  </button>

                  <button
                    type="button"
                    disabled
                    style={{ ...action, opacity: 0.6 }}
                  >
                    {t('storefront.reviewItemsAndLatestTotal')}
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>

                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--primary-strong)',
                      margin: '10px 0 0',
                    }}
                  >
                    {selectedTable ? ui.demoNote : ui.tableRequired}
                  </p>

                  {demoTable && (
                    <p
                      role="status"
                      style={{
                        ...pale,
                        margin: '10px 0 0',
                        fontSize: 12,
                        color: 'var(--primary-strong)',
                      }}
                    >
                      {ui.demoSuccess} {demoTable}. {ui.demoNotSent}.
                    </p>
                  )}
                </>
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
      <div
        className="shop-cart-product-content"
        style={{
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
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

            <p
              style={{
                margin: '0 0 7px',
                color: palette.muted,
                fontSize: 13,
              }}
            >
              {item.variant_name}
            </p>

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

            <p
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                margin: '7px 0 0',
                color: palette.muted,
                fontSize: 12,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  flexShrink: 0,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#25BE69',
                }}
              />
              {ui.added}
            </p>
          </div>

          {/* REMOVE PRODUCT */}
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            aria-label={`${t('storefront.remove')} ${item.product_name}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              flexShrink: 0,
              padding: 4,
              border: 0,
              background: 'transparent',
              fontFamily: 'inherit',
              fontSize: 12,
              color: palette.muted,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            <Trash2 size={16} aria-hidden="true" />
            {t('storefront.remove')}
          </button>
        </div>

        {/* QUANTITY AND PRICE */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <div
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
              style={{
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
              style={{
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
