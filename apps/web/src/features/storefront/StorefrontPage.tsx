import { Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PackageOpen, ShoppingBag } from 'lucide-react';
import { Card, Loading, Tag } from '../../components/ui/primitives';
import { storefrontRequest, type ShopSummary } from '../../lib/storefront-api';
import { ShopCatalog } from './ShopCatalog';
import { ShopError } from './shop-feedback';
export { ShopError, ShopPagination } from './shop-feedback';
import { ApiError } from '../../lib/api';
import './storefront.css';

export function StorefrontPage() {
  const { slug } = useParams();
  return slug ? <ShopCatalog key={slug} slug={slug} /> : <ShopEntry />;
}
function ShopEntry() {
  const shops = useQuery({
    queryKey: ['storefront-directory'],
    queryFn: async ({ signal }) => {
      const items = await storefrontRequest<ShopSummary[]>('', {
        signal,
        storeMode: () => {},
      });
      if (items.length > 1)
        throw new ApiError(
          502,
          'ข้อมูลร้านเดียวไม่ถูกต้อง กรุณาตรวจการตั้งค่าระบบ',
        );
      return items;
    },
    retry: false,
  });
  if (shops.data?.length === 1)
    return (
      <Navigate
        to={`/shop/${encodeURIComponent(shops.data[0].slug)}`}
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
        {shops.data?.length === 0 && (
          <Card className="storefront-status">
            <PackageOpen size={40} aria-hidden="true" />
            <h2>ยังไม่มีร้านที่เปิดเผยแพร่</h2>
            <p>
              เมื่อร้านตั้งค่าหน้าร้านและเผยแพร่สินค้าแล้ว
              คุณจะเลือกซื้อได้ที่นี่
            </p>
          </Card>
        )}
      </section>
    </>
  );
}
