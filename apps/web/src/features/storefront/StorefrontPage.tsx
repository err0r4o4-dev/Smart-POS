import { PackageOpen, ShoppingBag } from 'lucide-react';
import { Button, Card, Tag } from '../../components/ui/primitives';

export function StorefrontPage() {
  return (
    <>
      <section className="storefront-hero" aria-labelledby="storefront-title">
        <div>
          <p className="eyebrow">พื้นที่ของลูกค้า</p>
          <h1 id="storefront-title" tabIndex={-1}>
            หน้าร้านออนไลน์
          </h1>
          <p>
            พื้นที่สำหรับเลือกซื้อสินค้า แยกจากการจัดการร้านและงานของพนักงาน
          </p>
          <Tag tone="amber">ยังไม่เปิดขายออนไลน์</Tag>
        </div>
        <div className="storefront-illustration" aria-hidden="true">
          <ShoppingBag size={88} strokeWidth={1.3} />
        </div>
      </section>
      <Card className="storefront-status" id="online-status">
        <PackageOpen size={44} strokeWidth={1.4} aria-hidden="true" />
        <h2>ยังไม่เปิดรับคำสั่งซื้อ</h2>
        <p>
          หน้าร้านนี้ยังไม่ได้เชื่อมแค็ตตาล็อกสาธารณะ ระบบออเดอร์
          และการชำระเงินออนไลน์ จึงยังไม่มีสินค้าสำหรับสั่งซื้อ
        </p>
        <p>
          ไม่มีรายการสินค้าจำลอง ไม่รับข้อมูลจัดส่งหรือหลักฐานชำระเงิน
          และไม่สร้างรายการขายจากหน้านี้
        </p>
        <Button disabled>ยังไม่เปิดรับคำสั่งซื้อ</Button>
      </Card>
    </>
  );
}
