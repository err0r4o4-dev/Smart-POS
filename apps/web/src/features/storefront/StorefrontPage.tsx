import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PackageOpen, ShoppingBag } from 'lucide-react';
import { Button, Card, Loading, Tag } from '../../components/ui/primitives';
import {
  storefrontRequest,
  type ShopSummary,
  type ShopSettings,
  type ShopProduct,
  type ShopPage,
} from '../../lib/storefront-api';
import { exactDecimal, moneyText } from '../../lib/pos-api';
import { useShopCart } from './shop-cart';
import { ApiError } from '../../lib/api';
import type { StoreMode } from '../../lib/store-mode';
import './storefront.css';

export function StorefrontPage() {
  const { slug } = useParams();
  return slug ? <ShopCatalog key={slug} slug={slug} /> : <ShopDirectory />;
}
function ShopDirectory() {
  const shops = useQuery({
    queryKey: ['storefront-directory'],
    queryFn: async ({ signal }) => {
      const metadata: { storeMode: StoreMode } = { storeMode: 'multi' };
      const items = await storefrontRequest<ShopSummary[]>('', {
        signal,
        storeMode: (mode) => {
          metadata.storeMode = mode;
        },
      });
      if (metadata.storeMode === 'single' && items.length > 1)
        throw new ApiError(
          502,
          'ข้อมูลร้านเดียวไม่ถูกต้อง กรุณาตรวจการตั้งค่าระบบ',
        );
      return { items, storeMode: metadata.storeMode };
    },
    retry: false,
  });
  if (shops.data?.storeMode === 'single' && shops.data.items.length === 1)
    return (
      <Navigate
        to={`/shop/${encodeURIComponent(shops.data.items[0].slug)}`}
        replace
      />
    );
  return (
    <>
      <section className="storefront-hero" aria-labelledby="storefront-title">
        <div>
          <p className="eyebrow">พื้นที่ของลูกค้า</p>
          <h1 id="storefront-title" tabIndex={-1}>
            หน้าร้านออนไลน์
          </h1>
          <p>เลือกสินค้า ส่งออเดอร์ แล้วมารับและชำระเงินที่ร้าน</p>
          <Tag tone="amber">รับสินค้าที่ร้าน · ไม่มีการชำระเงินออนไลน์</Tag>
        </div>
        <ShoppingBag size={72} strokeWidth={1.3} aria-hidden="true" />
      </section>
      <section id="online-status" aria-label="ร้านที่เผยแพร่">
        {shops.isPending && <Loading>กำลังโหลดหน้าร้าน…</Loading>}
        {shops.error && (
          <ShopError error={shops.error} retry={() => void shops.refetch()} />
        )}
        {shops.data?.items.length === 0 && (
          <Card className="storefront-status">
            <PackageOpen size={40} aria-hidden="true" />
            <h2>ยังไม่มีร้านที่เปิดเผยแพร่</h2>
            <p>
              เมื่อร้านตั้งค่าหน้าร้านและเผยแพร่สินค้าแล้ว
              คุณจะเลือกซื้อได้ที่นี่
            </p>
          </Card>
        )}
        <div className="shop-grid">
          {shops.data?.items.map((shop) => (
            <Card key={shop.slug} className="shop-product">
              <h2>{shop.name}</h2>
              <Tag tone={shop.accepting_orders ? 'success' : 'amber'}>
                {shop.accepting_orders
                  ? 'เปิดรับออเดอร์'
                  : 'ปิดรับออเดอร์ชั่วคราว'}
              </Tag>
              <Link className="button" to={`/shop/${shop.slug}`}>
                ดูสินค้า
              </Link>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
function ShopCatalog({ slug }: { slug: string }) {
  const cart = useShopCart(slug);
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const shop = useQuery({
    queryKey: ['storefront', slug, 'settings'],
    queryFn: ({ signal }) =>
      storefrontRequest<ShopSettings>(`/${slug}`, { signal }),
    retry: false,
  });
  const products = useQuery({
    queryKey: ['storefront', slug, 'products', submitted, page],
    queryFn: ({ signal }) =>
      storefrontRequest<ShopPage<ShopProduct>>(
        `/${slug}/products?search=${encodeURIComponent(submitted)}&page=${page}`,
        { signal },
      ),
    enabled: !!shop.data,
    retry: false,
  });
  if (shop.isPending) return <Loading>กำลังโหลดร้าน…</Loading>;
  if (shop.error || !shop.data)
    return <ShopError error={shop.error} retry={() => void shop.refetch()} />;
  const store = shop.data;
  return (
    <>
      <section className="shop-heading">
        <div>
          <p className="eyebrow">สั่งออนไลน์ · รับและจ่ายที่ร้าน</p>
          <h1>{store.name}</h1>
          <p>{store.description}</p>
        </div>
        <Link className="button" to={`/shop/${slug}/cart`}>
          <ShoppingBag size={18} aria-hidden="true" /> ตะกร้า (
          {cart.items.length})
        </Link>
      </section>
      <Card id="online-status" className="shop-notice">
        <Tag tone={store.accepting_orders ? 'success' : 'amber'}>
          {store.accepting_orders ? 'เปิดรับออเดอร์' : 'ปิดรับออเดอร์ชั่วคราว'}
        </Tag>
        <p>
          การส่งออเดอร์ยังไม่กันสต็อก รอร้านตรวจสอบก่อนมารับสินค้า
          ยอดสุดท้ายยืนยันที่ POS ก่อนชำระ
        </p>
        {store.pickup_instructions && <p>{store.pickup_instructions}</p>}
        {store.contact_phone && <p>ติดต่อร้าน: {store.contact_phone}</p>}
      </Card>
      <form
        className="shop-search"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(search.trim());
          setPage(1);
        }}
      >
        <label htmlFor="shop-search">ค้นหาสินค้า</label>
        <div className="shop-actions">
          <input
            id="shop-search"
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ชื่อสินค้า ตัวเลือก หรือ SKU"
          />
          <Button type="submit">ค้นหา</Button>
        </div>
      </form>
      <p role="status" className="shop-feedback">
        {message}
      </p>
      {products.isPending && <Loading>กำลังโหลดสินค้า…</Loading>}
      {products.error && (
        <ShopError
          error={products.error}
          retry={() => void products.refetch()}
        />
      )}
      {products.data?.total === 0 && (
        <Card>
          <h2>ไม่พบสินค้า</h2>
          <p>ลองเปลี่ยนคำค้น หรือรอร้านเผยแพร่สินค้า</p>
        </Card>
      )}
      <div className="shop-grid">
        {products.data?.items.map((product) => {
          const available = (exactDecimal(product.available, 3) ?? 0n) > 0n;
          return (
            <Card className="shop-product" key={product.variant_id}>
              <PackageOpen size={32} aria-hidden="true" />
              <div>
                <h2>{product.product_name}</h2>
                <p>{product.variant_name}</p>
              </div>
              <small>
                SKU {product.sku} · หน่วย {product.unit}
              </small>
              <strong className="shop-price">
                ฿{moneyText(product.unit_price)}
              </strong>
              <p>
                {available && product.saleable
                  ? `สต็อกที่บันทึก ${product.available} ${product.unit}`
                  : 'สินค้ายังไม่พร้อมขาย'}
              </p>
              <Button
                disabled={
                  !store.accepting_orders ||
                  !product.saleable ||
                  !available ||
                  cart.items.length >= 100
                }
                onClick={() => {
                  cart.add(product);
                  setMessage(`เพิ่ม ${product.product_name} ลงตะกร้าแล้ว`);
                }}
              >
                เพิ่มลงตะกร้า
              </Button>
            </Card>
          );
        })}
      </div>
      {products.data && (
        <ShopPagination
          page={page}
          pageSize={products.data.page_size}
          total={products.data.total}
          change={setPage}
        />
      )}
    </>
  );
}
export function ShopError({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <p>
        {error instanceof Error ? error.message : 'ไม่พบข้อมูลที่เข้าถึงได้'}
      </p>
      {retry && (
        <Button className="button-secondary" onClick={retry}>
          ลองอีกครั้ง
        </Button>
      )}
    </div>
  );
}
export function ShopPagination({
  page,
  total,
  pageSize,
  change,
}: {
  page: number;
  total: number;
  pageSize: number;
  change: (page: number) => void;
}) {
  return (
    <nav className="shop-actions shop-pagination" aria-label="หน้ารายการ">
      <Button
        className="button-secondary"
        disabled={page <= 1}
        onClick={() => change(page - 1)}
      >
        ก่อนหน้า
      </Button>
      <span>
        หน้า {page} · {total} รายการ
      </span>
      <Button
        className="button-secondary"
        disabled={page * pageSize >= total}
        onClick={() => change(page + 1)}
      >
        ถัดไป
      </Button>
    </nav>
  );
}
