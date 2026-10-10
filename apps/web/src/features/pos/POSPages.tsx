import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Loading } from '../../components/ui/primitives';
import {
  posRequest,
  moneyText,
  adjustQuantity,
  exactDecimal,
  paymentLabels,
  type POSPage,
  type POSItem,
  type POSCart,
  type CartSummary,
  type POSCheckout,
  type PaymentMethod,
  type POSShift,
} from '../../lib/pos-api';
import { usePOS } from './POSContext';

export function POSTerminalPage() {
  const pos = usePOS();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('');
  const scanner = useRef<HTMLInputElement>(null);
  const products = useQuery({
    queryKey: [
      'tenant',
      pos.user,
      pos.org,
      'pos',
      pos.branch,
      'products',
      pos.terminal?.id,
      submitted,
      category,
    ],
    queryFn: ({ signal }) =>
      posRequest<POSPage<POSItem>>(
        pos.org,
        `/pos/products?terminal_id=${pos.terminal?.id}&search=${encodeURIComponent(submitted)}&category_id=${category}`,
        { signal },
      ),
    enabled: !!pos.terminal,
  });
  const categories = useQuery({
    queryKey: ['tenant', pos.user, pos.org, 'pos-categories'],
    queryFn: ({ signal }) =>
      posRequest<POSPage<{ id: string; name: string }>>(
        pos.org,
        '/categories?page_size=100',
        { signal },
      ),
  });
  const add = async (item: POSItem) => {
    if (!pos.shift || !pos.terminal || !item.saleable) return;
    let cart = pos.cart;
    if (!cart) {
      cart = await pos.mutate<POSCart>('/pos/carts', {
        terminal_id: pos.terminal.id,
      });
      if (!cart) return;
      pos.setCart(cart.id);
    }
    const items = cart.items.map((value) => ({
      variant_id: value.variant_id,
      quantity: value.quantity,
    }));
    const current = items.find((value) => value.variant_id === item.variant_id);
    if (current) current.quantity = adjustQuantity(current.quantity, 1000n);
    else items.push({ variant_id: item.variant_id, quantity: '1' });
    await pos.mutate(
      `/pos/carts/${cart.id}`,
      { revision: cart.revision, items },
      'PATCH',
    );
    scanner.current?.focus();
  };
  const scan = async () => {
    if (!barcode.trim() || !pos.terminal) return;
    try {
      const result = await posRequest<POSPage<POSItem>>(
        pos.org,
        `/pos/barcodes/${encodeURIComponent(barcode.trim())}?terminal_id=${pos.terminal.id}`,
      );
      const item = result.items[0];
      if (!item?.saleable) {
        pos.setMessage('สินค้านี้ไม่พร้อมขาย');
        return;
      }
      await add(item);
      setBarcode('');
    } catch {
      pos.setMessage('ไม่พบบาร์โค้ดนี้ใน Catalog — ไม่สร้างสินค้าอัตโนมัติ');
    }
  };
  return (
    <>
      <h1>ขายสินค้า</h1>
      <p>สต็อกแสดงยอดที่บันทึก ณ ตำแหน่งขาย ไม่ใช่การยืนยันจำนวนจริงบนชั้น</p>
      {!pos.shift && (
        <p className="notice">
          ต้อง <Link to="/pos/register/open">เปิดกะของคุณ</Link> ก่อนเริ่มขาย
        </p>
      )}
      <div className="pos-grid">
        <Card className="product-panel">
          <form
            className="pos-search"
            onSubmit={(event) => {
              event.preventDefault();
              void scan();
            }}
          >
            <label>
              สแกนบาร์โค้ด
              <input
                ref={scanner}
                aria-label="สแกนบาร์โค้ด"
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
                placeholder="สแกนแล้วกด Enter"
                autoComplete="off"
                disabled={pos.busy}
              />
            </label>
            <Button type="submit" disabled={pos.busy || !pos.shift}>
              เพิ่มจากบาร์โค้ด
            </Button>
          </form>
          <form
            className="pos-search"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(search);
            }}
          >
            <label>
              ค้นหาสินค้า
              <input
                aria-label="ค้นหาสินค้า"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ชื่อ / SKU"
              />
            </label>
            <Button type="submit">ค้นหา</Button>
          </form>
          <label>
            หมวดหมู่
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">ทุกหมวดหมู่</option>
              {categories.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {products.isFetching && <Loading>กำลังค้นหาสินค้า…</Loading>}
          {products.error && (
            <p role="alert">
              โหลดสินค้าไม่สำเร็จ{' '}
              <Button onClick={() => void products.refetch()}>ลองใหม่</Button>
            </p>
          )}
          <div className="pos-products">
            {products.data?.items.map((item) => (
              <article className="pos-product" key={item.variant_id}>
                <h3>{item.product_name}</h3>
                <p>
                  {item.variant_name} · {item.sku}
                </p>
                <strong>
                  {moneyText(item.unit_price)} บาท / {item.unit}
                </strong>
                <small>
                  คงเหลือ {item.available} · {item.product_status}/
                  {item.variant_status}
                </small>
                <Button
                  disabled={
                    pos.busy ||
                    !pos.shift ||
                    !item.saleable ||
                    exactDecimal(item.available, 3) === 0n
                  }
                  onClick={() => void add(item)}
                >
                  เพิ่ม {item.sku}
                </Button>
              </article>
            ))}
          </div>
          {products.data?.total === 0 && <p>ไม่พบสินค้า</p>}
          <p>
            แสดง {products.data?.items.length ?? 0} จาก{' '}
            {products.data?.total ?? 0} รายการ — ใช้คำค้นเพื่อจำกัดผลลัพธ์
          </p>
        </Card>
        <Card className="cart-panel">
          <CartPanel />
          <Button
            disabled={!pos.cart?.items.length || !pos.shift || pos.busy}
            onClick={() => navigate('/pos/checkout')}
          >
            ไปชำระเงิน
          </Button>
        </Card>
      </div>
    </>
  );
}

function CartPanel() {
  const pos = usePOS();
  const cart = pos.cart;
  const update = async (variantID: string, quantity: string) => {
    if (!cart) return;
    const amount = exactDecimal(quantity, 3);
    if (amount === null || amount <= 0n) {
      pos.setMessage('จำนวนต้องมากกว่า 0 และมีทศนิยมไม่เกิน 3 ตำแหน่ง');
      return;
    }
    await pos.mutate(
      `/pos/carts/${cart.id}`,
      {
        revision: cart.revision,
        items: cart.items.map((item) => ({
          variant_id: item.variant_id,
          quantity: item.variant_id === variantID ? quantity : item.quantity,
        })),
      },
      'PATCH',
    );
  };
  const remove = async (variantID: string) => {
    if (cart)
      await pos.mutate(
        `/pos/carts/${cart.id}`,
        {
          revision: cart.revision,
          items: cart.items
            .filter((item) => item.variant_id !== variantID)
            .map((item) => ({
              variant_id: item.variant_id,
              quantity: item.quantity,
            })),
        },
        'PATCH',
      );
  };
  return (
    <>
      <h2>ตะกร้าสินค้า</h2>
      {!cart?.items.length && <p>ยังไม่มีสินค้าในตะกร้า</p>}
      {cart?.items.map((item) => (
        <div className="pos-cart-item" key={item.variant_id}>
          <h3>{item.product_name}</h3>
          <small>
            {item.sku} · {item.unit} · {moneyText(item.unit_price)} บาท
          </small>
          <div className="pos-quantity">
            <Button
              aria-label={`ลด ${item.sku}`}
              disabled={pos.busy}
              onClick={() =>
                void update(
                  item.variant_id,
                  adjustQuantity(item.quantity, -1000n),
                )
              }
            >
              −
            </Button>
            <QuantityInput
              key={`${item.variant_id}:${cart.revision}`}
              item={item}
              disabled={pos.busy}
              update={(quantity) => void update(item.variant_id, quantity)}
            />
            <Button
              aria-label={`เพิ่มจำนวน ${item.sku}`}
              disabled={pos.busy}
              onClick={() =>
                void update(
                  item.variant_id,
                  adjustQuantity(item.quantity, 1000n),
                )
              }
            >
              +
            </Button>
            <Button
              aria-label={`ลบ ${item.sku}`}
              disabled={pos.busy}
              onClick={() => void remove(item.variant_id)}
            >
              ลบ
            </Button>
          </div>
          <strong>{moneyText(item.line_total)} บาท</strong>
          {item.price_changed && (
            <p role="status">
              ราคาเปลี่ยนจาก {item.previous_price} — ตรวจสอบและอัปเดตตะกร้า
            </p>
          )}
          {!item.saleable && <p>สินค้าไม่พร้อมขาย — นำออกจากตะกร้า</p>}
          {(exactDecimal(item.available, 3) ?? 0n) <
            (exactDecimal(item.quantity, 3) ?? 0n) && (
            <p>สต็อกไม่พอ: มี {item.available}</p>
          )}
        </div>
      ))}
      <div className="checkout-summary">
        <span>ยอดรวม (ไม่มีส่วนลด / ไม่คำนวณภาษีแยก)</span>
        <strong>{moneyText(cart?.total ?? '0.00')} บาท</strong>
        <Button
          disabled={!cart?.items.length || pos.busy}
          onClick={() =>
            void (async () => {
              if (!cart) return;
              const result = await pos.mutate<POSCart>(
                `/pos/carts/${cart.id}/hold`,
                { revision: cart.revision },
              );
              if (result) {
                pos.setCart('');
                pos.setMessage('พักตะกร้าแล้ว — ไม่สำรองสต็อก');
              }
            })()
          }
        >
          พักตะกร้า
        </Button>
        <Button
          disabled={!cart?.items.length || pos.busy}
          onClick={() =>
            cart &&
            void pos.mutate(
              `/pos/carts/${cart.id}`,
              { revision: cart.revision, items: [] },
              'PATCH',
            )
          }
        >
          ล้างตะกร้า
        </Button>
        {cart?.review_required && (
          <Button
            disabled={pos.busy}
            onClick={() =>
              void pos.mutate(
                `/pos/carts/${cart.id}`,
                {
                  revision: cart.revision,
                  items: cart.items.map((item) => ({
                    variant_id: item.variant_id,
                    quantity: item.quantity,
                  })),
                },
                'PATCH',
              )
            }
          >
            ยอมรับราคาปัจจุบันและตรวจสอบใหม่
          </Button>
        )}
      </div>
    </>
  );
}
function QuantityInput({
  item,
  disabled,
  update,
}: {
  item: POSItem;
  disabled: boolean;
  update: (value: string) => void;
}) {
  const [value, setValue] = useState(item.quantity);
  return (
    <input
      aria-label={`จำนวน ${item.sku}`}
      inputMode="decimal"
      value={value}
      disabled={disabled}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (value !== item.quantity) update(value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

export function HeldCartsPage() {
  const pos = usePOS();
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: [
      'tenant',
      pos.user,
      pos.org,
      'pos',
      pos.branch,
      'held',
      page,
      pos.terminal?.id,
    ],
    queryFn: ({ signal }) =>
      posRequest<POSPage<CartSummary>>(
        pos.org,
        `/pos/carts?status=HELD&branch_id=${pos.branch}&terminal_id=${pos.terminal?.id}&page=${page}`,
        { signal },
      ),
    enabled: !!pos.terminal,
  });
  return (
    <>
      <h1>ตะกร้าพัก</h1>
      <p>
        เฉพาะตะกร้าของคุณในเครื่องนี้ ไม่สำรองสต็อก
        ราคาจะตรวจสอบใหม่เมื่อกลับมาขาย
      </p>
      {query.isPending && <Loading />}
      {query.error && <p role="alert">โหลดตะกร้าพักไม่สำเร็จ</p>}
      {query.data?.items.map((item) => (
        <Card key={item.id}>
          <p>
            ตะกร้า {item.id.slice(0, 8)} ·{' '}
            {new Date(item.updated_at).toLocaleString('th-TH')}
          </p>
          <Button
            disabled={pos.busy || !pos.shift}
            onClick={() =>
              void (async () => {
                const result = await pos.mutate<POSCart>(
                  `/pos/carts/${item.id}/resume`,
                  { revision: item.revision, terminal_id: pos.terminal?.id },
                );
                if (result) {
                  pos.setCart(result.id);
                  if (result.review_required)
                    pos.setMessage('ราคา / สถานะ / สต็อกเปลี่ยน กรุณาตรวจสอบ');
                  navigate('/pos');
                }
              })()
            }
          >
            กลับมาขาย
          </Button>
          <Button
            disabled={pos.busy}
            onClick={() =>
              void pos.mutate(`/pos/carts/${item.id}/cancel`, {
                revision: item.revision,
              })
            }
          >
            ยกเลิกตะกร้า
          </Button>
        </Card>
      ))}
      {query.data?.total === 0 && <p>ไม่มีตะกร้าพัก</p>}
      <POSPagination
        page={page}
        total={query.data?.total ?? 0}
        busy={query.isFetching}
        change={setPage}
      />
    </>
  );
}

export function CheckoutPage() {
  const pos = usePOS();
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [received, setReceived] = useState('');
  const [reference, setReference] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [selected, setSelected] = useState<POSCheckout>();
  const request = useRef<{ key: string; body: object } | null>(null);
  const [requestLocked, setRequestLocked] = useState(false);
  const confirmKey = useRef(crypto.randomUUID());
  const pending = useQuery({
    queryKey: [
      'tenant',
      pos.user,
      pos.org,
      'pos',
      pos.branch,
      'pending',
      pos.terminal?.id,
    ],
    queryFn: ({ signal }) =>
      posRequest<POSPage<POSCheckout>>(
        pos.org,
        `/pos/checkouts?branch_id=${pos.branch}&terminal_id=${pos.terminal?.id}`,
        { signal },
      ),
    enabled: !!pos.terminal,
  });
  const checkout =
    selected ??
    pending.data?.items.find(
      (item) =>
        item.cart_id === pos.cart?.id &&
        ['AWAITING_PAYMENT', 'CONFIRMED', 'RECONCILIATION_REQUIRED'].includes(
          item.status,
        ),
    );
  const prepare = async () => {
    if (!pos.cart) return;
    setRequestLocked(true);
    if (!request.current)
      request.current = {
        key: crypto.randomUUID(),
        body: {
          cart_id: pos.cart.id,
          revision: pos.cart.revision,
          method,
          expected_total: pos.cart.total,
          received: method === 'CASH' ? received : pos.cart.total,
        },
      };
    const result = await pos.mutate<POSCheckout>(
      '/pos/checkout',
      request.current.body,
      'POST',
      request.current.key,
    );
    if (result) setSelected(result);
  };
  const confirm = async () => {
    if (!checkout) return;
    const result = await pos.mutate<POSCheckout>(
      `/pos/payments/${checkout.id}/confirm`,
      { acknowledged, reference },
      'POST',
      confirmKey.current,
    );
    if (result) setSelected(result);
  };
  const complete = async () => {
    if (!checkout) return;
    const result = await pos.mutate<POSCheckout>(
      `/pos/checkouts/${checkout.id}/complete`,
      {},
    );
    if (result) {
      setSelected(result);
      if (result.status === 'COMPLETED') {
        pos.setCart('');
        pos.setMessage('ขายสำเร็จและตัดสต็อกแล้ว การพิมพ์ไม่มีผลต่อรายการขาย');
      }
    }
  };
  return (
    <>
      <h1>ชำระเงิน</h1>
      <Card className="pos-checkout">
        <p>
          ราคาสุดท้ายคำนวณจาก Catalog บนเซิร์ฟเวอร์ การเลือก QR /
          โอนยังไม่ใช่การรับเงิน
        </p>
        {!checkout ? (
          <>
            <strong className="pos-total">
              ยอดรวม {moneyText(pos.cart?.total ?? '0.00')} บาท
            </strong>
            <label>
              วิธีชำระเงิน
              <select
                value={method}
                disabled={pos.busy || requestLocked}
                onChange={(event) =>
                  setMethod(event.target.value as PaymentMethod)
                }
              >
                {Object.entries(paymentLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {method === 'CASH' && (
              <label>
                เงินรับ
                <input
                  aria-label="เงินรับ"
                  inputMode="decimal"
                  value={received}
                  disabled={pos.busy || requestLocked}
                  onChange={(event) => setReceived(event.target.value)}
                />
              </label>
            )}
            <Button
              disabled={pos.busy || !pos.cart?.items.length || !pos.shift}
              onClick={() => void prepare()}
            >
              ตรวจสอบยอดและเตรียมชำระเงิน
            </Button>
            {requestLocked && (
              <Button
                disabled={pos.busy}
                onClick={() => {
                  request.current = null;
                  setRequestLocked(false);
                  pos.setMessage(
                    'เปลี่ยนข้อมูลได้แล้ว หากมีรายการค้างเซิร์ฟเวอร์จะป้องกันการชำระซ้ำ',
                  );
                }}
              >
                แก้ไขข้อมูลหลังตรวจสถานะ
              </Button>
            )}
          </>
        ) : (
          <>
            <p>
              รายการ {checkout.id} · สถานะ <strong>{checkout.status}</strong>
            </p>
            <p>{paymentLabels[checkout.method]}</p>
            <strong className="pos-total">
              {moneyText(checkout.total)} บาท
            </strong>
            <p>
              เงินรับ {moneyText(checkout.received)} · เงินทอน{' '}
              {moneyText(checkout.change)}
            </p>
            {checkout.status === 'AWAITING_PAYMENT' && (
              <>
                <p className="notice">
                  ตรวจสอบเงินจริงก่อนยืนยัน
                  ไม่เชื่อมธนาคารและไม่ตรวจสลิปอัตโนมัติ
                </p>
                {checkout.method !== 'CASH' && (
                  <label>
                    อ้างอิงการชำระเงิน
                    <input
                      aria-label="อ้างอิงการชำระเงิน"
                      value={reference}
                      maxLength={200}
                      onChange={(event) => setReference(event.target.value)}
                    />
                  </label>
                )}
                <label className="pos-checkbox">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                  />
                  ฉันตรวจสอบแล้วว่าได้รับเงินจริง
                </label>
                <Button
                  disabled={
                    pos.busy ||
                    !acknowledged ||
                    (checkout.method !== 'CASH' && !reference.trim())
                  }
                  onClick={() => void confirm()}
                >
                  ยืนยันรับเงินจริง
                </Button>
                <Button
                  disabled={pos.busy}
                  onClick={() =>
                    void (async () => {
                      const result = await pos.mutate<POSCheckout>(
                        `/pos/checkouts/${checkout.id}/cancel`,
                        {},
                      );
                      if (result) {
                        setSelected(undefined);
                        request.current = null;
                        setRequestLocked(false);
                        confirmKey.current = crypto.randomUUID();
                      }
                    })()
                  }
                >
                  ยกเลิกก่อนรับเงิน
                </Button>
              </>
            )}
            {['CONFIRMED', 'RECONCILIATION_REQUIRED'].includes(
              checkout.status,
            ) && (
              <>
                <p role="status">ยืนยันเงินแล้ว แต่ยังไม่ใช่การขายสำเร็จ</p>
                {checkout.failure_code && (
                  <p role="alert">
                    {checkout.failure_code} — หลักฐานเงินยังอยู่ ต้องตรวจสอบ
                    ห้ามเรียกเก็บเงินซ้ำ
                  </p>
                )}
                <Button disabled={pos.busy} onClick={() => void complete()}>
                  {checkout.status === 'CONFIRMED'
                    ? 'บันทึกขายและตัดสต็อก'
                    : 'ลองบันทึกขายเดิมอีกครั้ง'}
                </Button>
                <Link to="/pos/shifts">ตรวจสอบรายการเงินค้าง</Link>
              </>
            )}
            {checkout.status === 'COMPLETED' && (
              <>
                <p role="status">ขายสำเร็จ</p>
                <Link to={`/sales/${checkout.sale_id}`}>
                  ดูรายการขายและพิมพ์ใบเสร็จ
                </Link>
                <Button
                  onClick={() => {
                    setSelected(undefined);
                    request.current = null;
                    setRequestLocked(false);
                    confirmKey.current = crypto.randomUUID();
                    setReceived('');
                    setReference('');
                    setAcknowledged(false);
                  }}
                >
                  เริ่มรายการใหม่
                </Button>
              </>
            )}
          </>
        )}
      </Card>
    </>
  );
}

export function RegisterPage({
  section,
}: {
  section: 'open' | 'close' | 'history' | 'shifts';
}) {
  const pos = usePOS();
  const [cash, setCash] = useState('0.00');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [page, setPage] = useState(1);
  const key = useRef(crypto.randomUUID());
  const locations = useQuery({
    queryKey: ['tenant', pos.user, pos.org, 'pos', pos.branch, 'locations'],
    queryFn: ({ signal }) =>
      posRequest<POSPage<{ id: string; name: string; type: string }>>(
        pos.org,
        `/inventory/locations?branch_id=${pos.branch}&status=ACTIVE&page_size=100`,
        { signal },
      ),
    enabled: section === 'open' && pos.can('pos.terminal.manage'),
  });
  const history = useQuery({
    queryKey: [
      'tenant',
      pos.user,
      pos.org,
      'pos',
      pos.branch,
      'register-history',
      page,
    ],
    queryFn: ({ signal }) =>
      posRequest<POSPage<POSShift>>(
        pos.org,
        `/pos/shifts?branch_id=${pos.branch}&page=${page}`,
        { signal },
      ),
    enabled: section === 'history',
  });
  const payments = useQuery({
    queryKey: [
      'tenant',
      pos.user,
      pos.org,
      'pos',
      pos.branch,
      'payment-history',
      page,
    ],
    queryFn: ({ signal }) =>
      posRequest<POSPage<POSCheckout>>(
        pos.org,
        `/pos/checkouts?branch_id=${pos.branch}&page=${page}`,
        { signal },
      ),
    enabled: section === 'shifts',
  });
  return (
    <>
      <h1>
        {
          {
            open: 'เปิดกะขาย',
            close: 'ปิดกะและนับเงิน',
            history: 'ประวัติกะ',
            shifts: 'ตรวจสอบการชำระเงิน',
          }[section]
        }
      </h1>
      {section === 'open' && (
        <>
          <Card>
            <p>หนึ่งเครื่องมีได้หนึ่งกะ และหนึ่งแคชเชียร์มีได้หนึ่งกะเปิด</p>
            <label>
              เงินเปิดกะ
              <input
                aria-label="เงินเปิดกะ"
                value={cash}
                inputMode="decimal"
                onChange={(event) => setCash(event.target.value)}
              />
            </label>
            <Button
              disabled={pos.busy || !pos.terminal || !!pos.shift}
              onClick={() =>
                void pos.mutate(
                  '/pos/shifts/open',
                  { terminal_id: pos.terminal?.id, opening_cash: cash },
                  'POST',
                  key.current,
                )
              }
            >
              เปิดกะขาย
            </Button>
          </Card>
          {pos.can('pos.terminal.manage') && (
            <Card>
              <h2>ตั้งค่าเครื่องขาย</h2>
              <label>
                รหัสเครื่อง
                <input
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.toUpperCase())
                  }
                />
              </label>
              <label>
                ชื่อเครื่อง
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                ตำแหน่งสต็อกขาย
                <select
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                >
                  <option value="">เลือกตำแหน่ง</option>
                  {locations.data?.items
                    .filter((item) =>
                      ['WAREHOUSE', 'SALES_FLOOR', 'SHELF'].includes(item.type),
                    )
                    .map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name} ({item.type})
                      </option>
                    ))}
                </select>
              </label>
              <Button
                disabled={pos.busy || !location || !name || !code}
                onClick={() =>
                  void pos.mutate('/pos/terminals', {
                    branch_id: pos.branch,
                    code,
                    name,
                    stock_location_id: location,
                    status: 'ACTIVE',
                  })
                }
              >
                สร้างเครื่องขาย
              </Button>
            </Card>
          )}
        </>
      )}
      {section === 'close' && (
        <Card>
          {pos.shift ? (
            <>
              <p>เงินเปิดกะ {moneyText(pos.shift.opening_cash)}</p>
              <p>ยอดขายเงินสดสุทธิ {moneyText(pos.shift.cash_sales)}</p>
              <p>คืนเงินสด {moneyText(pos.shift.cash_refunds ?? '0.00')}</p>
              <strong>
                เงินควรมี {moneyText(pos.shift.expected_cash)} บาท
              </strong>
              <p>QR / โอนไม่รวมในลิ้นชัก เงินค้างต้องจัดการก่อนปิดกะ</p>
              <label>
                เงินนับจริง
                <input
                  aria-label="เงินนับจริง"
                  value={cash}
                  inputMode="decimal"
                  onChange={(event) => setCash(event.target.value)}
                />
              </label>
              <Button
                disabled={pos.busy}
                onClick={() =>
                  void (async () => {
                    const result = await pos.mutate<POSShift>(
                      `/pos/shifts/${pos.shift?.id}/close`,
                      { counted_cash: cash },
                      'POST',
                      key.current,
                    );
                    if (result)
                      pos.setMessage(
                        `ปิดกะแล้ว ส่วนต่าง ${result.difference} บาท`,
                      );
                  })()
                }
              >
                ยืนยันปิดกะ
              </Button>
            </>
          ) : (
            <p>ไม่มีกะเปิดของคุณในเครื่องนี้</p>
          )}
        </Card>
      )}
      {section === 'history' && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>เครื่อง / แคชเชียร์</th>
                <th>เวลา</th>
                <th>เปิดกะ</th>
                <th>ขายเงินสด</th>
                <th>คืนเงินสด</th>
                <th>ควรมี</th>
                <th>นับจริง / ส่วนต่าง</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {history.data?.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.terminal_name}
                    <br />
                    {item.cashier_name}
                  </td>
                  <td>
                    {new Date(item.opened_at).toLocaleString('th-TH')}
                    <br />
                    {item.closed_at &&
                      new Date(item.closed_at).toLocaleString('th-TH')}
                  </td>
                  <td>{item.opening_cash}</td>
                  <td>{item.cash_sales}</td>
                  <td>{item.cash_refunds ?? '0.00'}</td>
                  <td>{item.expected_cash}</td>
                  <td>
                    {item.counted_cash ?? '?'} / {item.difference ?? '?'}
                  </td>
                  <td>{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.error && <p role="alert">โหลดประวัติกะไม่สำเร็จ</p>}
        </div>
      )}
      {section === 'shifts' && (
        <>
          <p>
            รายการยืนยันเงินแล้วแต่ขายไม่สำเร็จต้องตรวจสอบด้วยคน
            ระบบไม่โอนเงินคืนอัตโนมัติ
          </p>
          {pos.can('pos.payment.reconcile') && (
            <label>
              บันทึกหลักฐานการตรวจสอบ / การคืนเงินนอกระบบ
              <input
                value={note}
                maxLength={2000}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          )}
          {payments.data?.items
            .filter((item) =>
              [
                'AWAITING_PAYMENT',
                'CONFIRMED',
                'RECONCILIATION_REQUIRED',
              ].includes(item.status),
            )
            .map((item) => (
              <Card key={item.id}>
                <p>
                  {item.id} · {item.status} · {paymentLabels[item.method]}
                </p>
                <strong>{item.total} บาท</strong>
                <p>
                  อ้างอิง: {item.reference || '—'} · {item.failure_code}
                </p>
                {item.status === 'AWAITING_PAYMENT' ? (
                  <Button
                    disabled={pos.busy}
                    onClick={() =>
                      void pos.mutate(`/pos/checkouts/${item.id}/cancel`, {})
                    }
                  >
                    ยกเลิกก่อนรับเงิน
                  </Button>
                ) : (
                  <>
                    <Button
                      disabled={pos.busy}
                      onClick={() =>
                        void (async () => {
                          const result = await pos.mutate<POSCheckout>(
                            `/pos/checkouts/${item.id}/complete`,
                            {},
                          );
                          if (result)
                            pos.setMessage(
                              result.status === 'COMPLETED'
                                ? 'ขายสำเร็จ'
                                : `ยังต้องตรวจสอบ: ${result.failure_code}`,
                            );
                        })()
                      }
                    >
                      ลองบันทึกขายเดิม
                    </Button>
                    {pos.can('pos.payment.reconcile') && (
                      <Button
                        disabled={pos.busy || !note.trim()}
                        onClick={() =>
                          void pos.mutate(`/pos/checkouts/${item.id}/resolve`, {
                            acknowledged: true,
                            note,
                          })
                        }
                      >
                        ยืนยันตรวจสอบเงินเสร็จแล้ว
                      </Button>
                    )}
                  </>
                )}
              </Card>
            ))}
          {payments.error && <p role="alert">โหลดรายการชำระเงินไม่สำเร็จ</p>}
        </>
      )}
      {['history', 'shifts'].includes(section) && (
        <POSPagination
          page={page}
          total={
            (section === 'history' ? history.data : payments.data)?.total ?? 0
          }
          busy={history.isFetching || payments.isFetching}
          change={setPage}
        />
      )}
    </>
  );
}

function POSPagination({
  page,
  total,
  busy,
  change,
}: {
  page: number;
  total: number;
  busy: boolean;
  change: (page: number) => void;
}) {
  return (
    <div className="pos-pagination">
      <Button disabled={busy || page <= 1} onClick={() => change(page - 1)}>
        ก่อนหน้า
      </Button>
      <span>
        หน้า {page} · ทั้งหมด {total} รายการ
      </span>
      <Button
        disabled={busy || page * 25 >= total}
        onClick={() => change(page + 1)}
      >
        ถัดไป
      </Button>
    </div>
  );
}
