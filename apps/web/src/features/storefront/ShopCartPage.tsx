import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
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
import { useShopCart } from './shop-cart';

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
export function ShopCartPage() {
  const { slug = '' } = useParams();
  return <CartContents key={slug} slug={slug} />;
}
function CartContents({ slug }: { slug: string }) {
  const cart = useShopCart(slug);
  const navigate = useNavigate();
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
      storefrontRequest<ShopSettings>(`/${slug}`, { signal }),
    retry: false,
  });
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
        body: { order_id: identity.key, access_token: identity.token },
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
      setError(
        new Error(
          'เบราว์เซอร์บันทึกรหัสติดตามไม่ได้ กรุณาอนุญาต session storage ก่อนส่งออเดอร์',
        ),
      );
      return;
    }
    setPending(true);
    setRetryInput(input);
    setError(null);
    submission.mutate(input);
  };
  if (pending)
    return (
      <Card className="shop-checkout">
        <h1>
          {submission.isPending
            ? 'กำลังส่งออเดอร์…'
            : 'ตรวจผลคำขอเดิมก่อนส่งใหม่'}
        </h1>
        <p>
          รหัสคำขอ: <code>{identity.key}</code>
        </p>
        <p>
          หากเครือข่ายขัดข้อง ออเดอร์อาจบันทึกแล้ว กรุณาตรวจผลหรือส่งคำขอเดิมซ้ำ
          ระบบใช้รหัสเดิมเพื่อป้องกันออเดอร์ซ้ำ
        </p>
        {error != null && <ShopError error={error} />}
        <div className="shop-actions">
          <Button
            disabled={submission.isPending || recovery.isPending}
            onClick={() => recovery.mutate()}
          >
            ตรวจผลออเดอร์
          </Button>
          {retryInput && (
            <Button
              className="button-secondary"
              disabled={submission.isPending || recovery.isPending}
              onClick={() => send(retryInput)}
            >
              ลองส่งคำขอเดิมอีกครั้ง
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
                กลับไปตรวจข้อมูลด้วยรหัสเดิม
              </Button>
            )}
        </div>
        <p>
          ข้อมูลติดต่อไม่ถูกบันทึกในเบราว์เซอร์
          หากรีเฟรชระหว่างส่งแล้วไม่พบออเดอร์ ให้กรอกข้อมูลใหม่โดยใช้รหัสเดิม
        </p>
      </Card>
    );
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
      total + (estimatedLine(item.unit_price, item.quantity) ?? 0n),
    0n,
  );
  return (
    <>
      <div className="shop-heading">
        <h1>ตะกร้าสินค้า</h1>
        <Link to={`/shop/${slug}`}>เลือกสินค้าเพิ่ม</Link>
      </div>
      {shop.isPending && <Loading>กำลังตรวจสถานะร้าน…</Loading>}
      {shop.error && (
        <ShopError error={shop.error} retry={() => void shop.refetch()} />
      )}
      <p className="notice">
        สินค้าในตะกร้ายังไม่ถูกกัน ระบบกันสินค้าหลังส่งออเดอร์สำเร็จ
        ยังไม่รับเงินออนไลน์ รอร้านตรวจสอบก่อนมารับ
        ยอดและโปรโมชันสุดท้ายยืนยันที่ POS
      </p>
      {!cart.items.length && (
        <Card>
          <h2>ตะกร้ายังว่าง</h2>
          <Link to={`/shop/${slug}`}>กลับไปเลือกสินค้า</Link>
        </Card>
      )}
      {!!cart.items.length && (
        <div className="shop-checkout-grid">
          <section aria-label="รายการในตะกร้า" className="shop-cart-lines">
            {cart.items.map((item) => (
              <Card key={item.variant_id} className="shop-cart-line">
                <div>
                  <h2>{item.product_name}</h2>
                  <p>
                    {item.variant_name} · {item.unit}
                  </p>
                  <small>
                    ฿{moneyText(item.unit_price)} / {item.unit}{' '}
                    (ข้อมูลที่เพิ่มลงตะกร้า)
                  </small>
                </div>
                <label>
                  จำนวน {item.product_name}
                  <input
                    type="number"
                    inputMode="decimal"
                    min={
                      ['COUNT', 'PACKAGING'].includes(item.unit_type)
                        ? '1'
                        : '0.001'
                    }
                    step={
                      ['COUNT', 'PACKAGING'].includes(item.unit_type)
                        ? '1'
                        : '0.001'
                    }
                    value={item.quantity}
                    disabled={busy}
                    onChange={(event) => {
                      cart.update(
                        cart.items.map((line) =>
                          line.variant_id === item.variant_id
                            ? { ...line, quantity: event.target.value }
                            : line,
                        ),
                      );
                      quote.reset();
                      setError(null);
                    }}
                  />
                </label>
                <Button
                  className="button-secondary"
                  disabled={busy}
                  onClick={() => {
                    cart.update(
                      cart.items.filter(
                        (line) => line.variant_id !== item.variant_id,
                      ),
                    );
                    quote.reset();
                  }}
                >
                  นำ {item.product_name} ออก
                </Button>
              </Card>
            ))}
          </section>
          <Card className="shop-checkout">
            <h2>รับสินค้าและชำระที่ร้าน</h2>
            <p>{shop.data?.pickup_instructions}</p>
            <p>
              ยอดจากตะกร้าโดยประมาณ{' '}
              <strong>฿{moneyText(centsText(estimated))}</strong>
            </p>
            <Button
              disabled={busy || !valid || !shop.data?.accepting_orders}
              onClick={() => {
                setError(null);
                quote.mutate();
              }}
            >
              ตรวจรายการและยอดล่าสุด
            </Button>
            {shop.data && !shop.data.accepting_orders && (
              <p role="status">ร้านปิดรับออเดอร์ชั่วคราว</p>
            )}
            {!valid && (
              <p role="alert">
                กรอกจำนวนให้ถูกต้อง สินค้าประเภทชิ้น/แพ็กต้องเป็นจำนวนเต็ม
              </p>
            )}
            {quote.error && <ShopError error={quote.error} />}
            {error != null && <ShopError error={error} />}
            {quote.data && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!quote.data || busy) return;
                  send({
                    ...customer,
                    items: cart.items.map(({ variant_id, quantity }) => ({
                      variant_id,
                      quantity,
                    })),
                    quote_id: quote.data.quote_id,
                    access_token: identity.token,
                  });
                }}
              >
                <div className="shop-quote" role="status">
                  <h3>ยอดล่าสุด ฿{moneyText(quote.data.estimated_total)}</h3>
                  {quote.data.items.map((line) => (
                    <p key={line.variant_id}>
                      {line.product_name} × {line.quantity} — ฿
                      {moneyText(line.line_total)}
                    </p>
                  ))}
                  <small>
                    ยังไม่รวมส่วนลด/รางวัลที่อาจใช้ได้ที่ POS ไม่มีค่าจัดส่ง
                    เพราะรับที่ร้านเท่านั้น
                  </small>
                </div>
                <label>
                  ชื่อผู้รับสินค้า
                  <input
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
                  เบอร์ติดต่อ
                  <input
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
                  หมายเหตุถึงร้าน
                  <input
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
                <label className="shop-consent">
                  <input type="checkbox" required />
                  ฉันเข้าใจว่าระบบกันสินค้าหลังส่งออเดอร์สำเร็จจนถึงเวลาหมดอายุ
                  ต้องรอร้านตรวจสอบและยืนยันยอดสุดท้ายก่อนชำระที่ร้าน
                </label>
                <p>
                  <small>
                    ร้านใช้ชื่อและเบอร์เพื่อติดต่อเรื่องออเดอร์นี้
                    ไม่ใช่การสมัครบัญชีหรือยินยอมรับการตลาด
                  </small>
                </p>
                <Button
                  type="submit"
                  disabled={busy || !shop.data?.accepting_orders}
                >
                  ส่งออเดอร์ · ยังไม่ชำระเงิน
                </Button>
              </form>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
