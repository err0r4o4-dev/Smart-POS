import { useLanguage } from '../../app/language';
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import { exactDecimal, moneyText } from '../../lib/pos-api';
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
} from '../../lib/storefront-api';
import { ShopError } from './StorefrontPage';
import { useShopCart, type CartEntry } from './shop-cart';

// Responsive layout without a separate CSS file.
const responsiveCartCSS = `
  .velopos-cart,
  .velopos-cart * {
    box-sizing: border-box;
  }

  .velopos-cart {
    width: 100%;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .velopos-cart img {
    max-width: 100%;
  }

  .velopos-cart input,
  .velopos-cart select,
  .velopos-cart textarea {
    max-width: 100%;
    min-width: 0;
  }

  @media (max-width: 1023px) {
    .velopos-cart {
      padding: 18px 16px !important;
    }
  }

  @media (max-width: 767px) {
    .velopos-cart {
      padding: 14px 12px !important;
    }

    .velopos-cart > div > section[aria-label],
    .velopos-cart > div > aside {
      flex: 1 1 100% !important;
    }

    .velopos-cart header {
      flex-direction: column;
      align-items: stretch !important;
      gap: 12px !important;
    }

    .velopos-cart header h1 {
      font-size: 26px !important;
    }

    .velopos-cart header a,
    .velopos-cart header button {
      width: 100%;
      justify-content: center;
    }

    .velopos-cart article {
      gap: 12px !important;
    }

    .velopos-cart article > div:first-child {
      width: 100% !important;
      height: 190px !important;
      flex-shrink: 0 !important;
    }

    .velopos-cart article > div:nth-child(2) {
      flex: 1 1 100% !important;
      width: 100%;
    }

    .velopos-cart article > div:nth-child(2) > div:last-child {
      justify-content: space-between !important;
    }

    .velopos-cart aside {
      width: 100%;
      max-width: 100%;
    }

    .velopos-cart input:not([aria-label]),
    .velopos-cart textarea {
      font-size: 16px;
    }
  }

  @media (max-width: 380px) {
    .velopos-cart {
      padding: 10px 8px !important;
    }

    .velopos-cart article > div:first-child {
      height: 160px !important;
    }

    .velopos-cart article {
      padding: 12px !important;
    }

    .velopos-cart aside {
      padding: 12px !important;
    }
  }
`;

// Theme colors.
const colors = {
  navy: '#111B38',
  muted: '#70798C',
  yellow: '#F8CA49',
  pale: '#FFF8E6',
  border: '#E7EAF0',
  price: '#A66C13',
};

// Thai and English UI text.
const words = {
  th: {
    cart: 'ตะกร้าสินค้า',
    checkout: 'ยืนยันคำสั่งซื้อ',
    tracking: 'ติดตามออเดอร์',
    backCart: 'กลับไปตะกร้า',
    dining: 'รูปแบบการรับประทาน',
    takeaway: 'ซื้อกลับบ้าน',
    dineIn: 'ทานที่ร้าน',
    table: 'โต๊ะ',
    selectTable: 'เลือกโต๊ะ (ตัวอย่าง)',
    tableHint: 'หมายเลขโต๊ะเป็นข้อมูลตัวอย่าง ยังไม่เชื่อมต่อระบบร้าน',
    selectedTableLabel: 'โต๊ะที่เลือก',
    pickupHeading: 'รูปแบบการรับสินค้า',
    pickupHelp: 'รับสินค้าด้วยตนเองที่ร้าน',
    payment: 'วิธีการชำระเงิน',
    demoPayment: 'ชำระเงินที่ร้าน (ตัวอย่าง UI)',
    summary: 'สรุปคำสั่งซื้อ',
    items: 'รายการสินค้า',
    discount: 'ส่วนลด',
    noDiscount: 'ไม่มี',
    total: 'ราคารวม',
    remove: 'นำออก',
    added: 'เพิ่มลงตะกร้าแล้ว',
    decrease: 'ลดจำนวน',
    increase: 'เพิ่มจำนวน',
    demoAction: 'สั่งอาหารทานที่ร้าน (ตัวอย่าง)',
    demoNote:
      'การทานที่ร้านเป็นเพียงตัวอย่าง UI ยังไม่ได้เชื่อมต่อการส่งออเดอร์',
    demoSuccess: 'นี่เป็นเพียงตัวอย่าง ไม่มีการส่งออเดอร์ไปยังร้าน',
    checkoutHint: 'ตรวจสอบยอดล่าสุดและกรอกข้อมูลก่อนส่งคำสั่งซื้อ',
    verified: 'รายการสินค้าที่ตรวจสอบแล้ว',
    latestTotal: 'ยอดล่าสุดจากระบบร้าน',
    customer: 'ข้อมูลผู้รับสินค้า',
    checking: 'กำลังตรวจสอบยอดล่าสุด...',
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
    selectTable: 'Choose a table (demo)',
    tableHint: 'Sample tables only; not connected to the restaurant',
    selectedTableLabel: 'Selected table',
    pickupHeading: 'Pickup method',
    pickupHelp: 'Collect your order at the store',
    payment: 'Payment method',
    demoPayment: 'Pay in store (UI demo)',
    summary: 'Order summary',
    items: 'Products',
    discount: 'Discount',
    noDiscount: 'None',
    total: 'Line total',
    remove: 'Remove',
    added: 'Added to cart',
    decrease: 'Decrease quantity',
    increase: 'Increase quantity',
    demoAction: 'Dine-in order (demo)',
    demoNote: 'Dine-in is a UI demo and does not submit an order.',
    demoSuccess: 'Demo only: no order was sent to the store.',
    checkoutHint:
      'Review the latest total and enter pickup details before placing the order',
    verified: 'Verified order items',
    latestTotal: 'Latest total from the store',
    customer: 'Pickup details',
    checking: 'Checking the latest total...',
  },
} as const;

const page: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  maxWidth: 1200,
  margin: '0 auto',
  padding: 'clamp(16px, 2vw, 28px)',
  minHeight: 'calc(100dvh - 180px)',
  color: colors.navy,
  fontFamily: 'inherit',
  lineHeight: 1.5,
};

const card: CSSProperties = {
  boxSizing: 'border-box',
  minWidth: 0,
  background: '#FFFFFF',
  border: '1px solid #EDF0F4',
  borderRadius: 15,
  boxShadow: '0 6px 22px rgba(17,27,56,0.05)',
};

const heading: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  fontSize: 17,
  fontWeight: 800,
  margin: '0 0 12px',
  lineHeight: 1.5,
};

const pale: CSSProperties = {
  borderRadius: 11,
  background: colors.pale,
  padding: 14,
  marginBottom: 14,
};

const field: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  minHeight: 44,
  marginTop: 6,
  padding: '10px 12px',
  borderRadius: 9,
  background: '#FFFFFF',
  border: `1px solid ${colors.border}`,
  color: colors.navy,
  fontFamily: 'inherit',
  fontSize: 14,
};

const primary: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 9,
  width: '100%',
  minHeight: 46,
  padding: '10px 14px',
  border: 0,
  borderRadius: 9,
  background: colors.yellow,
  color: colors.navy,
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 800,
  cursor: 'pointer',
};

const secondary: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '10px 16px',
  minHeight: 42,
  borderRadius: 10,
  background: '#FFF6D7',
  border: '1px solid #EFC94F',
  color: colors.navy,
  textDecoration: 'none',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};

// Existing order identity.
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

  const decimal = value % 1000n;

  return decimal === 0n
    ? (value / 1000n).toString()
    : `${value / 1000n}.${decimal
        .toString()
        .padStart(3, '0')
        .replace(/0+$/, '')}`;
}

// Main page.
export function ShopCartPage() {
  const { slug = '' } = useParams();

  return (
    <>
      <style>{responsiveCartCSS}</style>
      <CartContents key={slug} slug={slug} />
    </>
  );
}

function CartContents({ slug }: { slug: string }) {
  const { t, language } = useLanguage();
  const ui = words[language];

  const navigate = useNavigate();
  const cart = useShopCart(slug);

  // Dining mode.
  const [mode, setMode] = useState<'takeaway' | 'dine-in'>('takeaway');

  // Table selection for dine-in demo.
  const [selectedTable, setSelectedTable] = useState('');
  const [demoDone, setDemoDone] = useState(false);

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

  // Store settings.
  const shop = useQuery({
    queryKey: ['storefront', slug, 'settings'],
    queryFn: ({ signal }) =>
      storefrontRequest<ShopSettings>(`/${slug}`, { signal }),
    retry: false,
  });

  // Real takeaway quote.
  const quote = useMutation({
    mutationFn: () =>
      storefrontRequest<ShopQuote>(`/${slug}/quote`, {
        body: {
          items: cart.items.map(({ variant_id, quantity }) => ({
            variant_id,
            quantity,
          })),
        },
      }),
  });

  const trackingPath = `/shop/${slug}/track/${identity.key}#access=${identity.token}`;

  // Real takeaway order.
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
    setDemoDone(false);
    setError(null);
  };

  const chooseMode = (next: 'takeaway' | 'dine-in') => {
    if (next !== mode) {
      setMode(next);

      // Clear selected table when returning to takeaway.
      if (next === 'takeaway') {
        setSelectedTable('');
      }

      resetReview();
    }
  };

  const checkoutOpen = mode === 'takeaway' && !!quote.data;

  useEffect(() => {
    if (checkoutOpen) {
      try {
        window.scrollTo({ top: 0, behavior: 'auto' });
      } catch {
        // Ignore scrolling in non-browser test environments.
      }
    }
  }, [checkoutOpen]);

  // Pending-order recovery.
  if (pending) {
    return (
      <div className="velopos-cart" style={page}>
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
        (!['COUNT', 'PACKAGING'].includes(item.unit_type) ||
          units % 1000n === 0n)
      );
    });

  const estimated = cart.items.reduce(
    (sum, item) => sum + (estimatedLine(item.unit_price, item.quantity) ?? 0n),
    0n,
  );

  const submitOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !quote.data ||
      busy ||
      mode !== 'takeaway' ||
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
      access_token: identity.token,
    });
  };

  // PAGE 2: CHECKOUT
  if (checkoutOpen) {
    return (
      <div className="velopos-cart" style={page}>
        <PageHeader
          title={ui.checkout}
          backText={ui.backCart}
          onBack={resetReview}
        />

        <OrderSteps active={2} language={language} />

        <p
          style={{
            color: colors.muted,
            margin: '12px 0 20px',
          }}
        >
          {ui.checkoutHint}
        </p>

        {shop.error && (
          <ShopError error={shop.error} retry={() => void shop.refetch()} />
        )}

        {error != null && <ShopError error={error} />}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,390px),1fr))',
            gap: 20,
            alignItems: 'start',
          }}
        >
          {/* VERIFIED ORDER */}
          <section
            style={{
              ...card,
              padding: 'clamp(16px,2vw,24px)',
            }}
          >
            <h2 style={heading}>
              <ShoppingBag size={20} aria-hidden="true" />
              {ui.verified}
            </h2>

            {quote.data.items.map((item) => (
              <div
                key={item.variant_id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '13px 0',
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <strong style={{ overflowWrap: 'anywhere' }}>
                    {item.product_name}
                  </strong>

                  <p
                    style={{
                      margin: '4px 0 0',
                      color: colors.muted,
                      fontSize: 13,
                    }}
                  >
                    {item.variant_name} · {displayQuantity(item.quantity)}{' '}
                    {item.unit}
                  </p>
                </div>

                <strong
                  style={{
                    whiteSpace: 'nowrap',
                    color: colors.price,
                  }}
                >
                  ฿{moneyText(item.line_total)}
                </strong>
              </div>
            ))}

            <div
              style={{
                ...pale,
                margin: '18px 0 0',
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <strong>{ui.latestTotal}</strong>

              <strong
                style={{
                  color: colors.price,
                  fontSize: 24,
                }}
              >
                ฿{moneyText(quote.data.estimated_total)}
              </strong>
            </div>
          </section>

          {/* CUSTOMER FORM */}
          <form
            onSubmit={submitOrder}
            style={{
              ...card,
              padding: 'clamp(16px,2vw,24px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 17,
            }}
          >
            <h2 style={{ ...heading, margin: 0 }}>{ui.customer}</h2>

            <label>
              {t('storefront.pickupRecipientName')}

              <input
                style={field}
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

            <label>
              {t('storefront.contactPhone')}

              <input
                style={field}
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

            <label>
              {t('storefront.noteToStore')}

              <textarea
                style={{ ...field, resize: 'vertical' }}
                rows={3}
                maxLength={1000}
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
                lineHeight: 1.6,
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                required
                style={{ marginTop: 4, flexShrink: 0 }}
              />

              {t('storefront.iUnderstandStockIsReservedAfterSuccessful')}
            </label>

            <p
              style={{
                margin: 0,
                color: colors.muted,
                fontSize: 12,
              }}
            >
              {t('storefront.theStoreUsesYourNameAndPhone')}
            </p>

            <button
              type="submit"
              disabled={busy || !shop.data?.accepting_orders}
              style={{
                ...primary,
                opacity: busy || !shop.data?.accepting_orders ? 0.6 : 1,
              }}
            >
              {t('storefront.submitOrderUnpaid')}
              <ArrowRight size={17} aria-hidden="true" />
            </button>

            {shop.data && !shop.data.accepting_orders && (
              <p role="status">
                {t('storefront.theStoreHasTemporarilyPausedOrders')}
              </p>
            )}

            <button
              type="button"
              onClick={resetReview}
              style={{ ...secondary, width: '100%' }}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {ui.backCart}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // PAGE 1: CART
  return (
    <div className="velopos-cart" style={page}>
      <PageHeader
        title={t('pos.shoppingCart')}
        backText={t('storefront.chooseMoreProducts')}
        to={`/shop/${slug}`}
      />

      <OrderSteps active={1} language={language} />

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
          ...pale,
          margin: '16px 0 20px',
          border: '1px solid #F0E0AA',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 38,
            height: 38,
            flexShrink: 0,
            borderRadius: '50%',
            background: colors.yellow,
          }}
        >
          <ShoppingCart size={20} aria-hidden="true" />
        </span>

        <span style={{ color: '#55472B', fontSize: 13 }}>
          {t('storefront.cartItemsAreNotReservedStockIs')}
        </span>
      </div>

      {cart.items.length === 0 ? (
        <div
          style={{
            ...card,
            minHeight: 240,
            padding: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 12,
            textAlign: 'center',
          }}
        >
          <ShoppingCart size={38} color={colors.muted} aria-hidden="true" />

          <h2 style={{ margin: 0 }}>{t('storefront.yourCartIsEmpty')}</h2>

          <Link to={`/shop/${slug}`} style={secondary}>
            {t('storefront.backToProducts')}
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            gap: 20,
          }}
        >
          {/* PRODUCTS */}
          <section
            aria-label={t('storefront.cartItems')}
            style={{
              display: 'flex',
              flex: '2 1 400px',
              minWidth: 0,
              flexDirection: 'column',
              gap: 16,
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
            style={{
              ...card,
              flex: '1 1 280px',
              minWidth: 0,
              padding: 'clamp(14px,1.5vw,20px)',
            }}
          >
            {/* DINING OPTION */}
            <section style={{ marginBottom: 15 }}>
              <h2 style={heading}>
                <UtensilsCrossed size={20} aria-hidden="true" />
                {ui.dining}
              </h2>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
                  gap: 9,
                }}
              >
                {(['takeaway', 'dine-in'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={busy}
                    aria-pressed={mode === option}
                    onClick={() => chooseMode(option)}
                    style={{
                      ...primary,
                      padding: '8px 6px',
                      minWidth: 0,
                      fontSize: 13,
                      border: `1px solid ${
                        mode === option ? colors.yellow : colors.border
                      }`,
                      background: mode === option ? colors.yellow : '#F7F8FA',
                      color: mode === option ? colors.navy : colors.muted,
                    }}
                  >
                    {option === 'takeaway' ? (
                      <ShoppingBag size={17} aria-hidden="true" />
                    ) : (
                      <UtensilsCrossed size={17} aria-hidden="true" />
                    )}

                    {option === 'takeaway' ? ui.takeaway : ui.dineIn}
                  </button>
                ))}
              </div>
            </section>

            {/* TAKEAWAY PICKUP METHOD */}
            {mode === 'takeaway' && (
              <section style={pale}>
                <h2 style={{ ...heading, fontSize: 15 }}>
                  <ShoppingBag size={19} aria-hidden="true" />
                  {ui.pickupHeading}
                </h2>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '11px 12px',
                    background: '#FFFFFF',
                    borderRadius: 9,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  <Check size={18} color="#188A52" aria-hidden="true" />

                  <strong style={{ fontSize: 14 }}>{ui.takeaway}</strong>
                </div>

                <p
                  style={{
                    margin: '9px 0 0',
                    color: '#85651D',
                    fontSize: 12,
                  }}
                >
                  {ui.pickupHelp}
                </p>
              </section>
            )}

            {/* TABLE SELECTION: DINE-IN DEMO ONLY */}
            {mode === 'dine-in' && (
              <section style={pale}>
                <label
                  htmlFor="shop-cart-table"
                  style={{
                    ...heading,
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
                  onChange={(event) => {
                    setSelectedTable(event.target.value);
                    setDemoDone(false);
                  }}
                  style={{
                    ...field,
                    marginTop: 0,
                    cursor: 'pointer',
                  }}
                >
                  <option value="">{ui.selectTable}</option>

                  {[
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
                  ].map((table) => (
                    <option key={table} value={table}>
                      {ui.table} {table}
                    </option>
                  ))}
                </select>

                <p
                  style={{
                    margin: '9px 0 0',
                    color: '#85651D',
                    fontSize: 12,
                  }}
                >
                  {selectedTable
                    ? `${ui.selectedTableLabel}: ${selectedTable} (Demo)`
                    : ui.tableHint}
                </p>
              </section>
            )}

            {/* PAYMENT */}
            <section style={pale}>
              <h2 style={heading}>
                <CreditCard size={20} aria-hidden="true" />
                {ui.payment}
              </h2>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontSize: 13,
                  color: '#505A6C',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: 'block',
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    flexShrink: 0,
                    border: `4px solid ${colors.yellow}`,
                    background: colors.navy,
                    boxShadow: 'inset 0 0 0 3px white',
                  }}
                />

                <span>
                  {mode === 'takeaway'
                    ? t('storefront.pickUpAndPayInStore')
                    : ui.demoPayment}
                </span>
              </div>

              {mode === 'takeaway' && shop.data?.pickup_instructions && (
                <p
                  style={{
                    margin: '8px 0 0 30px',
                    fontSize: 12,
                    color: colors.muted,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {shop.data.pickup_instructions}
                </p>
              )}
            </section>

            {/* TOTALS */}
            <section
              style={{
                paddingTop: 14,
                marginBottom: 14,
                borderTop: `1px solid ${colors.border}`,
              }}
            >
              <h2 style={heading}>{ui.summary}</h2>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  color: colors.muted,
                  fontSize: 13,
                  marginBottom: 10,
                }}
              >
                <span>
                  {ui.items} ({cart.items.length})
                </span>

                <span
                  style={{
                    color: colors.navy,
                    whiteSpace: 'nowrap',
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
                  color: colors.muted,
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                <span>{ui.discount}</span>
                <span>{ui.noDiscount}</span>
              </div>

              <div
                style={{
                  ...pale,
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
                    fontSize: 23,
                    color: colors.price,
                  }}
                >
                  ฿{moneyText(centsText(estimated))}
                </strong>
              </div>
            </section>

            {/* ACTION BUTTON */}
            {mode === 'takeaway' ? (
              <button
                type="button"
                disabled={busy || !valid || !shop.data?.accepting_orders}
                onClick={() => {
                  setError(null);
                  quote.mutate();
                }}
                style={{
                  ...primary,
                  opacity:
                    busy || !valid || !shop.data?.accepting_orders ? 0.6 : 1,
                }}
              >
                {quote.isPending
                  ? ui.checking
                  : t('storefront.reviewItemsAndLatestTotal')}

                <ArrowRight size={17} aria-hidden="true" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy || !valid || !selectedTable}
                  onClick={() => setDemoDone(true)}
                  style={{
                    ...primary,
                    opacity: busy || !valid || !selectedTable ? 0.6 : 1,
                    cursor:
                      busy || !valid || !selectedTable
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                >
                  <UtensilsCrossed size={17} aria-hidden="true" />
                  {ui.demoAction}
                </button>

                <p
                  style={{
                    fontSize: 12,
                    color: '#825F19',
                    margin: '10px 0 0',
                  }}
                >
                  {selectedTable ? ui.demoNote : ui.selectTable}
                </p>

                {demoDone && (
                  <p
                    role="status"
                    style={{
                      ...pale,
                      margin: '10px 0 0',
                      fontSize: 12,
                      color: '#825F19',
                    }}
                  >
                    {ui.demoSuccess}
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
  );
}

// Shared header within this file.
function PageHeader({
  title,
  backText,
  to,
  onBack,
}: {
  title: string;
  backText: string;
  to?: string;
  onBack?: () => void;
}) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        flexWrap: 'wrap',
        marginBottom: 18,
      }}
    >
      <h1
        style={{
          margin: 0,
          color: colors.navy,
          fontSize: 'clamp(26px,3vw,34px)',
          lineHeight: 1.25,
          fontWeight: 800,
        }}
      >
        {title}
      </h1>

      {to ? (
        <Link to={to} style={secondary}>
          <ArrowLeft size={17} aria-hidden="true" />
          {backText}
        </Link>
      ) : (
        <button type="button" onClick={onBack} style={secondary}>
          <ArrowLeft size={17} aria-hidden="true" />
          {backText}
        </button>
      )}
    </header>
  );
}

// Three-step indicator for cart and checkout.
function OrderSteps({
  active,
  language,
}: {
  active: 1 | 2;
  language: 'th' | 'en';
}) {
  const w = words[language];

  return (
    <nav
      aria-label={language === 'th' ? 'ขั้นตอนการสั่งซื้อ' : 'Order steps'}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        margin: '0 0 14px',
      }}
    >
      {[w.cart, w.checkout, w.tracking].map((label, index) => (
        <span
          key={label}
          aria-current={index + 1 === active ? 'step' : undefined}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            background: index + 1 === active ? '#FFF1C3' : '#F3F5F8',
            color: index + 1 === active ? colors.navy : colors.muted,
            fontSize: 12,
            fontWeight: index + 1 === active ? 800 : 500,
            padding: '6px 10px',
            borderRadius: 20,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 19,
              height: 19,
              background: index + 1 === active ? colors.yellow : '#E3E6ED',
              borderRadius: '50%',
              fontSize: 11,
            }}
          >
            {index + 1}
          </span>

          {label}
        </span>
      ))}
    </nav>
  );
}

// Individual product card.
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
  const ui = words[language];

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
    if (amount === null || amount + delta * step <= 0n) {
      return;
    }

    const next = quantityText(amount + delta * step);

    setEditing(false);
    setQuantityInput(displayQuantity(next));
    onUpdateQuantity(next);
  };

  const handleQuantityChange = (input: string) => {
    if (isCount ? !/^\d*$/.test(input) : !/^\d*(\.\d{0,3})?$/.test(input)) {
      return;
    }

    setEditing(true);
    setQuantityInput(input);

    if (input === '' || input === '.') {
      return;
    }

    const parsed = exactDecimal(isCount ? `${input}.000` : input, 3);

    if (parsed !== null && parsed > 0n) {
      onUpdateQuantity(quantityText(parsed));
    }
  };

  return (
    <article
      style={{
        ...card,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'stretch',
        gap: 16,
        padding: 15,
      }}
    >
      {/* PRODUCT IMAGE */}
      <div
        style={{
          width: 'clamp(115px,15vw,166px)',
          height: 'clamp(120px,15vw,154px)',
          flexShrink: 1,
          overflow: 'hidden',
          borderRadius: 10,
          background: '#F4F5F7',
        }}
      >
        {item.image_url && !imageFailed ? (
          <img
            src={item.image_url}
            alt={item.product_name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              color: '#9CA3AF',
            }}
          >
            <PackageOpen size={32} aria-hidden="true" />
          </div>
        )}
      </div>

      {/* PRODUCT INFORMATION */}
      <div
        style={{
          display: 'flex',
          flex: '1 1 210px',
          minWidth: 0,
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                fontSize: 'clamp(17px,1.7vw,20px)',
                fontWeight: 800,
                lineHeight: 1.4,
                margin: '0 0 5px',
                overflowWrap: 'anywhere',
              }}
            >
              {item.product_name}
            </h2>

            <p
              style={{
                margin: '0 0 7px',
                color: colors.muted,
                fontSize: 13,
              }}
            >
              {item.variant_name}
            </p>

            <div
              style={{
                color: colors.price,
                fontSize: 21,
                fontWeight: 800,
              }}
            >
              ฿{moneyText(item.unit_price)}{' '}
              <span
                style={{
                  color: colors.muted,
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
                color: colors.muted,
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
            aria-label={`${ui.remove}: ${item.product_name}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              flexShrink: 0,
              border: 0,
              borderRadius: 7,
              padding: '5px 8px',
              background: '#FFF1F1',
              color: '#B13E3E',
              fontSize: 12,
              fontFamily: 'inherit',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            <Trash2 size={16} aria-hidden="true" />
            {ui.remove}
          </button>
        </div>

        {/* QUANTITY AND PRICE */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '39px 54px 39px',
              height: 42,
              flexShrink: 0,
              overflow: 'hidden',
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
            }}
          >
            <button
              type="button"
              disabled={busy || amount === null || amount <= step}
              onClick={() => changeBy(-1n)}
              aria-label={`${ui.decrease}: ${item.product_name}`}
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minWidth: 0,
                padding: 0,
                border: 0,
                color: colors.navy,
                background: '#F5F7FA',
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              <Minus size={17} aria-hidden="true" />
            </button>

            <input
              type="text"
              inputMode={isCount ? 'numeric' : 'decimal'}
              aria-label={`${t('pos.quantity')} ${item.product_name}`}
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
                display: 'block',
                boxSizing: 'border-box',
                width: '54px',
                minWidth: 0,
                maxWidth: 'none',
                height: '42px',
                minHeight: 0,
                margin: 0,
                padding: 0,
                appearance: 'none',
                outlineOffset: -2,
                border: 0,
                borderLeft: `1px solid ${colors.border}`,
                borderRight: `1px solid ${colors.border}`,
                borderRadius: 0,
                background: '#FFFFFF',
                color: colors.navy,
                fontFamily: 'inherit',
                lineHeight: '42px',
                textAlign: 'center',
                fontSize: 14,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
              }}
            />

            <button
              type="button"
              disabled={busy || amount === null}
              onClick={() => changeBy(1n)}
              aria-label={`${ui.increase}: ${item.product_name}`}
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minWidth: 0,
                padding: 0,
                border: 0,
                color: colors.navy,
                background: '#F5F7FA',
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              <Plus size={17} aria-hidden="true" />
            </button>
          </div>

          {/* LINE TOTAL */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              minWidth: 85,
              gap: 2,
            }}
          >
            <span
              style={{
                color: colors.muted,
                fontSize: 12,
              }}
            >
              {ui.total}
            </span>

            <strong
              style={{
                fontSize: 21,
                lineHeight: 1.2,
                color: colors.price,
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