import { useEffect, useRef, useState } from 'react';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useWorkspaceNavigate as useNavigate } from '../../app/useWorkspaceNavigate';
import { useQuery } from '@tanstack/react-query';
import { Button, Card } from '../../components/ui/primitives';
import { QueryFeedback } from '../../components/feedback/QueryFeedback';
import {
  posRequest,
  moneyText,
  adjustQuantity,
  exactDecimal,
  type POSPage,
  type POSItem,
  type POSCart,
} from '../../lib/pos-api';
import { usePOS } from './POSContext';
import { CustomerPicker } from '../customers/CustomerPicker';
import { CartBatchPicker, type BatchSelection } from '../quality/BatchPicker';

export function POSTerminalPage() {
  const pos = usePOS();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('');
  const scanner = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F2') {
        event.preventDefault();
        scanner.current?.focus();
        scanner.current?.select();
      } else if (event.key === 'F4') {
        event.preventDefault();
        navigate('/pos/held-carts');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);
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
      batch_id: value.batch_id,
      batch_verified: value.batch_verified,
    }));
    const current = items.find((value) => value.variant_id === item.variant_id);
    if (current) current.quantity = adjustQuantity(current.quantity, 1000n);
    else
      items.push({
        variant_id: item.variant_id,
        quantity: '1',
        batch_id: null,
        batch_verified: false,
      });
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
              <span className="shortcut-badge" title="กด F2 เพื่อสลับมาช่องนี้">
                F2
              </span>
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
          <QueryFeedback
            loading={products.isFetching || categories.isFetching}
            error={products.error ?? categories.error}
            retry={() => {
              void products.refetch();
              void categories.refetch();
            }}
          />
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
  const update = async (
    variantID: string,
    quantity: string,
    batch?: BatchSelection,
  ) => {
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
          batch_id:
            item.variant_id === variantID && batch
              ? batch.batch_id
              : item.batch_id,
          batch_verified:
            item.variant_id === variantID && batch
              ? batch.batch_verified
              : item.batch_verified,
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
              batch_id: item.batch_id,
              batch_verified: item.batch_verified,
            })),
        },
        'PATCH',
      );
  };
  return (
    <>
      <h2>ตะกร้าสินค้า</h2>
      <CustomerPicker />
      {!cart?.items.length && <p>ยังไม่มีสินค้าในตะกร้า</p>}
      {cart?.items.map((item) => (
        <div className="pos-cart-item" key={item.variant_id}>
          <h3>{item.product_name}</h3>
          <CartBatchPicker
            key={`${item.variant_id}:${cart.revision}`}
            variant={item.variant_id}
            location={pos.terminal?.stock_location_id}
            label={`Batch/Lot ${item.sku}`}
            sellableOnly
            initial={{
              batch_id: item.batch_id ?? null,
              batch_verified: item.batch_verified ?? false,
            }}
            busy={pos.busy}
            save={(batch) => update(item.variant_id, item.quantity, batch)}
          />
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
                    batch_id: item.batch_id,
                    batch_verified: item.batch_verified,
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
