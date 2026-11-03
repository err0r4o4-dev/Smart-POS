
import { useLanguage } from '../../app/language';
import { useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
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

// Visual styling stays in this file only.
const theme = {
  navy: '#111B38',
  muted: '#737D8C',
  yellow: '#F8CA49',
  pale: '#FFF9E7',
  border: '#E9EBF0',
  price: '#A86E14',
  green: '#20C76B',
};

const pageStyle: CSSProperties = {
  width: '100%',
  maxWidth: 1160,
  margin: '0 auto',
  padding: '20px 16px 40px',
  color: theme.navy,
};

const cardStyle: CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #F0F1F4',
  borderRadius: 15,
  boxShadow: '0 5px 20px rgba(17, 27, 56, 0.05)',
};

const sectionTitleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  margin: '0 0 10px',
  color: theme.navy,
  fontSize: 17,
  fontWeight: 800,
};

const formInputStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 42,
  marginTop: 6,
  padding: '9px 12px',
  border: '1px solid #DFE3E9',
  borderRadius: 8,
  background: '#FFFFFF',
  color: theme.navy,
};

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

function displayQuantity(quantity: string): string {
  const amount = exactDecimal(quantity, 3);

  if (amount === null) return quantity;

  const whole = amount / 1000n;
  const fraction = amount % 1000n;

  if (fraction === 0n) return whole.toString();

  return `${whole}.${fraction
    .toString()
    .padStart(3, '0')
    .replace(/0+$/, '')}`;
}

function quantityText(amount: bigint): string {
  return `${amount / 1000n}.${(amount % 1000n)
    .toString()
    .padStart(3, '0')}`;
}

export function ShopCartPage() {
  const { slug = '' } = useParams();

  return <CartContents key={slug} slug={slug} />;
}

function CartContents({ slug }: { slug: string }) {
  const { t } = useLanguage();

const [diningType, setDiningType] = useState<'takeaway' | 'dine-in'>('takeaway');
const [selectedTable, setSelectedTable] = useState('');
const exampleTables = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12'];

  const cart = useShopCart(slug);
  const navigate = useNavigate();

  const [identity] = useState<RequestIdentity>(
    () =>
      pendingIdentity(slug) ?? {
        key: crypto.randomUUID(),
        token: newTrackingToken(),
      },
  );

  const [pending, setPending] = useState(
    () => pendingIdentity(slug) !== null,
  );

  const [retryInput, setRetryInput] =
    useState<ShopOrderInput | null>(null);

  const [customer, setCustomer] = useState({
    customer_name: '',
    contact_phone: '',
    customer_note: '',
  });

  const [error, setError] = useState<unknown>(null);

  // Existing storefront request.
  const shop = useQuery({
    queryKey: ['storefront', slug, 'settings'],
    queryFn: ({ signal }) =>
      storefrontRequest<ShopSettings>(`/${slug}`, { signal }),
    retry: false,
  });

  // Existing quote request.
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

  const trackingPath =
    `/shop/${slug}/track/${identity.key}#access=${identity.token}`;

  // Existing order submission.
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

  // Existing order recovery.
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
      sessionStorage.setItem(
        `shop-pending:${slug}`,
        JSON.stringify(identity),
      );
    } catch {
      setError(
        new Error(
          t('storefront.theBrowserCouldNotSaveTheTracking'),
        ),
      );
      return;
    }

    setPending(true);
    setRetryInput(input);
    setError(null);
    submission.mutate(input);
  };

  // Keep original pending order screen unchanged.
  if (pending) {
    return (
      <Card className="shop-checkout">
        <h1>
          {submission.isPending
            ? t('storefront.submittingOrder')
            : t(
                'storefront.checkTheOriginalRequestBeforeResubmitting',
              )}
        </h1>

        <p>
          {t('storefront.requestId')}{' '}
          <code>{identity.key}</code>
        </p>

        <p>
          {t('storefront.ifTheNetworkFailsTheOrderMay')}
        </p>

        {error != null && <ShopError error={error} />}

        <div className="shop-actions">
          <Button
            disabled={
              submission.isPending || recovery.isPending
            }
            onClick={() => recovery.mutate()}
          >
            {t('storefront.checkOrderResult')}
          </Button>

          {retryInput && (
            <Button
              className="button-secondary"
              disabled={
                submission.isPending || recovery.isPending
              }
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
                {t(
                  'storefront.returnToReviewWithTheSameId',
                )}
              </Button>
            )}
        </div>

        <p>
          {t('storefront.contactDetailsAreNotStoredInThe')}
        </p>
      </Card>
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
    (total, item) =>
      total +
      (estimatedLine(item.unit_price, item.quantity) ?? 0n),
    0n,
  );

  return (
    <main style={pageStyle}>
      {/* PAGE HEADING */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <h1
          style={{
            margin: 0,
            color: theme.navy,
            fontSize: 32,
            fontWeight: 800,
          }}
        >
          {t('pos.shoppingCart')}
        </h1>

        <Link
          to={`/shop/${slug}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 9,
            padding: '10px 15px',
            border: `1px solid ${theme.border}`,
            borderRadius: 9,
            background: '#FFFFFF',
            color: theme.navy,
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={17} aria-hidden="true" />
          {t('storefront.chooseMoreProducts')}
        </Link>
      </div>

      {shop.isPending && (
        <Loading>
          {t('storefront.checkingStoreStatus')}
        </Loading>
      )}

      {shop.error && (
        <ShopError
          error={shop.error}
          retry={() => void shop.refetch()}
        />
      )}

      {/* NOTICE BAR */}
      <div
        role="note"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 18,
          padding: '11px 15px',
          background: theme.pale,
          border: '1px solid #F1E3B2',
          borderRadius: 11,
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 38,
            height: 38,
            flexShrink: 0,
            background: theme.yellow,
            borderRadius: '50%',
          }}
        >
          <ShoppingCart size={20} aria-hidden="true" />
        </span>

        <span
          style={{
            color: '#51452A',
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {t('storefront.cartItemsAreNotReservedStockIs')}
        </span>
      </div>

      {/* EMPTY CART */}
      {cart.items.length === 0 && (
        <div
          style={{
            ...cardStyle,
            padding: '45px 20px',
            textAlign: 'center',
          }}
        >
          <ShoppingCart
            size={36}
            color={theme.muted}
            aria-hidden="true"
          />

          <h2>{t('storefront.yourCartIsEmpty')}</h2>

          <Link to={`/shop/${slug}`}>
            {t('storefront.backToProducts')}
          </Link>
        </div>
      )}

      {/* MAIN CART LAYOUT */}
      {cart.items.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          {/* PRODUCTS */}
          <section
            aria-label={t('storefront.cartItems')}
            style={{
              display: 'flex',
              flex: '1.8 1 570px',
              flexDirection: 'column',
              gap: 16,
              minWidth: 0,
            }}
          >
            {cart.items.map((item) => (
              <CartLineItem
                key={item.variant_id}
                item={item}
                busy={busy}
                onUpdateQuantity={(nextQuantity) => {
                  cart.update(
                    cart.items.map((entry) =>
                      entry.variant_id === item.variant_id
                        ? { ...entry, quantity: nextQuantity }
                        : entry,
                    ),
                  );

                  quote.reset();
                  setError(null);
                }}
                onRemove={() => {
                  cart.update(
                    cart.items.filter(
                      (entry) =>
                        entry.variant_id !== item.variant_id,
                    ),
                  );

                  quote.reset();
                  setError(null);
                }}
              />
            ))}
          </section>

          {/* SUMMARY PANEL */}
          <aside
            style={{
              ...cardStyle,
              flex: '1 1 340px',
              minWidth: 0,
              padding: 16,
            }}
          >
            {/* ORDER TYPE - PRESENTATION ONLY */}
           
<section style={{ marginBottom: 13 }}>
  <h2 style={sectionTitleStyle}>
    <UtensilsCrossed size={21} aria-hidden="true" />
    รูปแบบการรับประทาน
  </h2>

  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8,
    }}
  >
    <button
      type="button"
      aria-pressed={diningType === 'takeaway'}
      onClick={() => {
        setDiningType('takeaway');
        setSelectedTable('');
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 43,
        padding: 8,
        border:
          diningType === 'takeaway'
            ? '1px solid #F8CA49'
            : '1px solid #E9EBF0',
        borderRadius: 9,
        background:
          diningType === 'takeaway' ? theme.yellow : '#F7F8FA',
        color: diningType === 'takeaway' ? theme.navy : '#778093',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      <ShoppingBag size={17} aria-hidden="true" />
      ซื้อกลับบ้าน
    </button>

    <button
      type="button"
      aria-pressed={diningType === 'dine-in'}
      onClick={() => setDiningType('dine-in')}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 43,
        padding: 8,
        border:
          diningType === 'dine-in'
            ? '1px solid #F8CA49'
            : '1px solid #E9EBF0',
        borderRadius: 9,
        background:
          diningType === 'dine-in' ? theme.yellow : '#F7F8FA',
        color: diningType === 'dine-in' ? theme.navy : '#778093',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      <UtensilsCrossed size={17} aria-hidden="true" />
      ทานที่ร้าน
    </button>
  </div>
</section>


            {/* TABLE PREVIEW - NOT CONNECTED TO API */}
          
<section
  style={{
    padding: 12,
    marginBottom: 12,
    background: theme.pale,
    borderRadius: 10,
  }}
>
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
    }}
  >
    <UtensilsCrossed size={20} aria-hidden="true" />

    <div style={{ flex: 1, minWidth: 0 }}>
      <label
        htmlFor="shop-cart-table"
        style={{
          display: 'block',
          marginBottom: 7,
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        โต๊ะ
      </label>

      <select
        id="shop-cart-table"
        value={selectedTable}
        disabled={diningType !== 'dine-in'}
        onChange={(event) => setSelectedTable(event.target.value)}
        style={{
          width: '100%',
          minHeight: 43,
          padding: '10px 12px',
          border: '1px solid #E9EBF0',
          borderRadius: 8,
          background:
            diningType === 'dine-in' ? '#FFFFFF' : '#F7F8FA',
          color:
            diningType === 'dine-in' ? theme.navy : '#9BA3B1',
          fontSize: 13,
          cursor:
            diningType === 'dine-in' ? 'pointer' : 'not-allowed',
        }}
      >
        <option value="">
          {diningType === 'dine-in'
            ? 'กรุณาเลือกโต๊ะ (ตัวอย่าง)'
            : 'เลือกทานที่ร้านก่อน'}
        </option>

        {exampleTables.map((table) => (
          <option key={table} value={table}>
            โต๊ะ {table}
          </option>
        ))}
      </select>

      {diningType === 'dine-in' && (
        <p
          style={{
            margin: '8px 0 0',
            color: '#8B6A22',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          {selectedTable
            ? `เลือกโต๊ะ ${selectedTable} แล้ว (ตัวอย่าง UI)`
            : 'หมายเลขโต๊ะเป็นข้อมูลตัวอย่าง ยังไม่เชื่อมระบบร้าน'}
        </p>
      )}
    </div>
  </div>
</section>


            {/* PAYMENT */}
            <section
              style={{
                padding: 12,
                marginBottom: 14,
                background: theme.pale,
                borderRadius: 10,
              }}
            >
              <h2 style={sectionTitleStyle}>
                <CreditCard size={20} aria-hidden="true" />
                วิธีการชำระเงิน
              </h2>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  paddingLeft: 30,
                  fontSize: 13,
                  color: '#505A6B',
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    flexShrink: 0,
                    border: `4px solid ${theme.yellow}`,
                    borderRadius: '50%',
                    background: theme.navy,
                    boxShadow: 'inset 0 0 0 3px white',
                  }}
                />

                <span>
                  {t('storefront.pickUpAndPayInStore')}
                </span>
              </div>

              {shop.data?.pickup_instructions && (
                <p
                  style={{
                    margin: '9px 0 0 30px',
                    color: theme.muted,
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
                paddingTop: 14,
                borderTop: `1px solid ${theme.border}`,
              }}
            >
              <h2 style={sectionTitleStyle}>
                สรุปคำสั่งซื้อ
              </h2>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  marginBottom: 10,
                  color: theme.muted,
                  fontSize: 13,
                }}
              >
                <span>
                  ค่าสินค้า ({cart.items.length} รายการ)
                </span>

                <span style={{ color: theme.navy }}>
                  ฿{moneyText(centsText(estimated))}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  marginBottom: 12,
                  color: theme.muted,
                  fontSize: 13,
                }}
              >
                <span>ส่วนลด</span>
                <span>—</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '13px 12px',
                  marginBottom: 12,
                  borderRadius: 9,
                  background: '#FFF5D6',
                }}
              >
                <strong style={{ fontSize: 13 }}>
                  {t('storefront.estimatedCartTotal')}
                </strong>

                <strong
                  style={{
                    color: theme.price,
                    fontSize: 23,
                    whiteSpace: 'nowrap',
                  }}
                >
                  ฿{moneyText(centsText(estimated))}
                </strong>
              </div>
            </section>

            {/* REVIEW BUTTON */}
            {/* REVIEW BUTTON */}

{diningType === 'dine-in' && (
  <button
    type="button"
    disabled={!selectedTable}
    onClick={() => {
      window.alert(
        `ตัวอย่าง UI: เลือกสั่งอาหารทานที่โต๊ะ ${selectedTable} แล้ว\nยังไม่ได้ส่งคำสั่งซื้อไปยังระบบร้าน`,
      );
    }}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      width: '100%',
      minHeight: 45,
      marginBottom: 12,
      padding: '10px 14px',
      border: 0,
      borderRadius: 9,
      background: selectedTable ? theme.yellow : '#E9EBF0',
      color: theme.navy,
      fontSize: 14,
      fontWeight: 800,
      cursor: selectedTable ? 'pointer' : 'not-allowed',
    }}
  >
    <UtensilsCrossed size={18} aria-hidden="true" />
    สั่งอาหารทานที่ร้าน
    <ArrowRight size={17} aria-hidden="true" />
  </button>
)}

<button
  type="button"
  disabled={
    busy ||
    !valid ||
    !shop.data?.accepting_orders ||
    diningType === 'dine-in'
  }
  onClick={() => {
    setError(null);
    quote.mutate();
  }}
  style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    minHeight: 45,
    padding: '10px 14px',
    border: 0,
    borderRadius: 9,
    background: theme.yellow,
    color: theme.navy,
    fontSize: 13,
    fontWeight: 800,
    cursor:
      busy || diningType === 'dine-in'
        ? 'not-allowed'
        : 'pointer',
  }}
>
  {t('storefront.reviewItemsAndLatestTotal')}
  <ArrowRight size={17} aria-hidden="true" />
</button>

{diningType === 'dine-in' && (
  <p
    role="status"
    style={{
      margin: '10px 0',
      padding: '10px 12px',
      borderRadius: 8,
      background: '#FFF5D6',
      color: '#8B5D0A',
      fontSize: 12,
      lineHeight: 1.6,
    }}
  >
    โหมดทานที่ร้านยังไม่รองรับการส่งคำสั่งซื้อ
    กรุณาเลือกซื้อกลับบ้านเพื่อดำเนินการต่อ
  </p>
)}

            {shop.data && !shop.data.accepting_orders && (
              <p role="status">
                {t(
                  'storefront.theStoreHasTemporarilyPausedOrders',
                )}
              </p>
            )}

            {!valid && (
              <p role="alert">
                {t(
                  'storefront.enterValidQuantitiesPiecePackProductsRequire',
                )}
              </p>
            )}

            {quote.error && (
              <ShopError error={quote.error} />
            )}

            {error != null && (
              <ShopError error={error} />
            )}

            {/* ORIGINAL CHECKOUT FORM */}
           
            {quote.data && diningType === 'takeaway' && (

              <form
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 13,
                  marginTop: 18,
                  paddingTop: 18,
                  borderTop: `1px solid ${theme.border}`,
                }}
                onSubmit={(event) => {
                  event.preventDefault();

                  if (!quote.data || busy) return;

                  send({
                    ...customer,
                    items: cart.items.map(
                      ({ variant_id, quantity }) => ({
                        variant_id,
                        quantity,
                      }),
                    ),
                    quote_id: quote.data.quote_id,
                    access_token: identity.token,
                  });
                }}
              >
                <div className="shop-quote" role="status">
                  <h3>
                    {t('storefront.latestTotal')}{' '}
                    {moneyText(quote.data.estimated_total)}
                  </h3>

                  {quote.data.items.map((line) => (
                    <p key={line.variant_id}>
                      {line.product_name} × {line.quantity}{' '}
                      {t('storefront.label')}{' '}
                      {moneyText(line.line_total)}
                    </p>
                  ))}

                  <small>
                    {t(
                      'storefront.excludesDiscountsRewardsThatMayApplyAt',
                    )}
                  </small>
                </div>

                <label>
                  {t('storefront.pickupRecipientName')}
                  <input
                    required
                    maxLength={200}
                    autoComplete="name"
                    style={formInputStyle}
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
                    required
                    type="tel"
                    minLength={3}
                    maxLength={30}
                    autoComplete="tel"
                    style={formInputStyle}
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
                  <input
                    maxLength={1000}
                    style={formInputStyle}
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
                    gap: 9,
                    fontSize: 12,
                  }}
                >
                  <input type="checkbox" required />
                  {t(
                    'storefront.iUnderstandStockIsReservedAfterSuccessful',
                  )}
                </label>

                <p>
                  <small>
                    {t(
                      'storefront.theStoreUsesYourNameAndPhone',
                    )}
                  </small>
                </p>

                <Button
                  type="submit"
                  disabled={
                    busy ||
                    !shop.data?.accepting_orders
                  }
                >
                  {t('storefront.submitOrderUnpaid')}
                </Button>
              </form>
            )}
          </aside>
        </div>
      )}
    </main>
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
  const { t } = useLanguage();
  const [imageFailed, setImageFailed] = useState(false);
  const [quantityInput, setQuantityInput] = useState(
    () => displayQuantity(item.quantity),
  );
  const [editing, setEditing] = useState(false);

  const isCount = ['COUNT', 'PACKAGING'].includes(
    item.unit_type,
  );

  const amount = exactDecimal(item.quantity, 3);
  const step = isCount ? 1000n : 1n;

  const lineTotal = estimatedLine(
    item.unit_price,
    item.quantity,
  );

  const changeBy = (delta: bigint) => {
    if (amount === null) return;

    const updated = amount + delta * step;

    if (updated <= 0n) return;

    const next = quantityText(updated);

    setEditing(false);
    setQuantityInput(displayQuantity(next));
    onUpdateQuantity(next);
  };

  const handleQuantityChange = (value: string) => {
    if (isCount) {
      if (!/^\d*$/.test(value)) return;
    } else if (!/^\d*(\.\d{0,3})?$/.test(value)) {
      return;
    }

    setEditing(true);
    setQuantityInput(value);

    if (value === '' || value === '.') return;

    const next = isCount ? `${value}.000` : value;
    const parsed = exactDecimal(next, 3);

    if (parsed === null || parsed <= 0n) return;

    onUpdateQuantity(quantityText(parsed));
  };

  return (
    <div
      style={{
        ...cardStyle,
        display: 'flex',
        alignItems: 'stretch',
        flexWrap: 'wrap',
        gap: 20,
        padding: 14,
      }}
    >
      {/* PRODUCT IMAGE */}
      <div
        style={{
          width: 164,
          height: 150,
          flexShrink: 0,
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
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              color: '#9CA3AF',
            }}
          >
            <PackageOpen size={30} aria-hidden="true" />
          </div>
        )}
      </div>

      {/* PRODUCT INFORMATION */}
      <div
        style={{
          display: 'flex',
          flex: '1 1 280px',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 12,
          minWidth: 0,
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
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2
              style={{
                margin: '0 0 5px',
                color: theme.navy,
                fontSize: 20,
                fontWeight: 800,
                lineHeight: 1.35,
                overflowWrap: 'anywhere',
              }}
            >
              {item.product_name}
            </h2>

            <p
              style={{
                margin: '0 0 8px',
                color: theme.muted,
                fontSize: 13,
                lineHeight: 1.4,
              }}
            >
              {item.variant_name}
            </p>

            <div
              style={{
                color: theme.price,
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              ฿{moneyText(item.unit_price)}
              <span
                style={{
                  color: theme.muted,
                  fontSize: 13,
                  fontWeight: 400,
                }}
              >
                {' '} / {item.unit}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                marginTop: 5,
                color: theme.muted,
                fontSize: 12,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  flexShrink: 0,
                  background: theme.green,
                  borderRadius: '50%',
                }}
              />

              {t('storefront.detailsWhenAddedToCart')}
            </div>
          </div>

          {/* REMOVE BUTTON */}
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            aria-label={`${t('storefront.remove')} ${item.product_name}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              alignSelf: 'flex-start',
              flexShrink: 0,
              padding: 5,
              background: 'transparent',
              border: 0,
              color: '#778093',
              fontSize: 12,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            <Trash2 size={17} aria-hidden="true" />
            <span>{t('storefront.remove')}</span>
          </button>
        </div>

        {/* QUANTITY AND LINE TOTAL */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
            gap: 20,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'stretch',
              height: 42,
              overflow: 'hidden',
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              background: '#FFFFFF',
            }}
          >
            <button
              type="button"
              disabled={
                busy ||
                amount === null ||
                amount <= step
              }
              onClick={() => changeBy(-1n)}
              aria-label={`Decrease ${item.product_name}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 39,
                padding: 0,
                border: 0,
                background: '#F6F7FA',
                color: theme.navy,
                cursor: 'pointer',
              }}
            >
              <Minus size={17} aria-hidden="true" />
            </button>

            <label
              style={{
                display: 'flex',
                alignItems: 'stretch',
                width: 50,
                margin: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  overflow: 'hidden',
                  clipPath: 'inset(50%)',
                  whiteSpace: 'nowrap',
                }}
              >
                {t('pos.quantity')} {item.product_name}
              </span>

              <input
                type="text"
                inputMode={isCount ? 'numeric' : 'decimal'}
                value={
                  editing
                    ? quantityInput
                    : displayQuantity(item.quantity)
                }
                disabled={busy}
                onFocus={() => {
                  setQuantityInput(
                    displayQuantity(item.quantity),
                  );
                  setEditing(true);
                }}
                onChange={(event) =>
                  handleQuantityChange(event.target.value)
                }
                onBlur={() => {
                  setEditing(false);
                  setQuantityInput(
                    displayQuantity(item.quantity),
                  );
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  padding: '0 3px',
                  margin: 0,
                  border: 0,
                  borderLeft: `1px solid ${theme.border}`,
                  borderRight: `1px solid ${theme.border}`,
                  borderRadius: 0,
                  background: '#FFFFFF',
                  color: theme.navy,
                  textAlign: 'center',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              />
            </label>

            <button
              type="button"
              disabled={busy || amount === null}
              onClick={() => changeBy(1n)}
              aria-label={`Increase ${item.product_name}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 39,
                padding: 0,
                border: 0,
                background: '#F6F7FA',
                color: theme.navy,
                cursor: 'pointer',
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
              gap: 3,
              minWidth: 88,
              textAlign: 'right',
            }}
          >
            <span
              style={{
                color: theme.muted,
                fontSize: 12,
              }}
            >
              ราคารวม
            </span>

            <strong
              style={{
                color: theme.price,
                fontSize: 21,
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
              }}
            >
              ฿{moneyText(centsText(lineTotal ?? 0n))}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}
