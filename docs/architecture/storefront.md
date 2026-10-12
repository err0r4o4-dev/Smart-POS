# หน้าร้านออนไลน์: สั่งล่วงหน้า รับและชำระที่ร้าน

เพิ่มเติม 2026-10-12: มี [หน้าทดสอบ Stripe sandbox](payment-sandbox.md), [single-store mode แบบระบุองค์กรเดิมชัดเจน](single-store.md) และ [reservation foundation](online-reservations.md) สำหรับออเดอร์ใหม่หลัง migration15 โดยไม่ย้ายข้อมูลหรือเพิ่มสิทธิ์ ยังไม่เชื่อมการชำระของลูกค้า แยก source หน้าร้าน/หลังร้าน หรือจัดส่ง

## ขอบเขต

Flow: `/shop` → เลือกร้าน/สินค้า → ตะกร้า → ตรวจยอดล่าสุดและส่ง guest order → ติดตาม → พนักงานเตรียม → ลูกค้ารับที่ร้าน → เปิดเข้า POS → ตรวจ lot/ราคา/สต็อก → รับชำระ → sale + stock movement + payment + receipt + order completion ใน transaction เดียว

ไม่รองรับการชำระเงินออนไลน์ การจัดส่ง หรือบัญชีลูกค้า ออเดอร์ใหม่กันจำนวนสินค้าจาก source เดิมเมื่อ transaction สำเร็จ แต่ยังไม่จัดสรร lot; ยอดตอนสั่งเป็นประมาณการ ราคา ส่วนลด รางวัล และคุณภาพ/lot สุดท้ายต้องตรวจที่ POS หากไม่สามารถขายได้ พนักงานต้องแจ้งลูกค้าและปฏิเสธ/ยกเลิก ไม่สร้างยอดขายจำลอง ออเดอร์ก่อน migration15 ยังคงไม่กันสต็อก

## เริ่มใช้งาน

1. ต้องใช้ API/web รุ่นนี้และ schema **15** พร้อมกัน การทดสอบไม่ได้อัปเกรดฐานหลักที่ `localhost:8088` ให้โดยอัตโนมัติ
2. Owner/Manager เลือกสาขา ตั้งค่าเครื่อง POS ที่ ACTIVE และแหล่งสต็อกขายได้ก่อน; สินค้าต้อง ACTIVE มีราคา THB และสต็อกที่จุดนั้น
3. เปิด `/manage/settings/storefront` ใส่ชื่อร้าน, slug, เครื่องขาย, เบอร์ติดต่อ, จุดรับสินค้า/เวลา แล้วบันทึก ตรวจเครื่องหมาย **เผยแพร่หน้าร้าน** และ **เปิดรับออเดอร์** ตามต้องการ
4. เลือกเผยแพร่สินค้าเป็นราย variant ในหน้าเดียวกัน สินค้าที่ยังไม่ได้เลือกจะไม่ปรากฏที่ร้านสาธารณะ
5. ลูกค้าเปิด `/shop` หรือ `/shop/<slug>` เพิ่มสินค้า ตรวจยอด กรอกชื่อ/เบอร์/หมายเหตุ ยืนยันเงื่อนไขการกันสินค้าหลังส่งออเดอร์สำเร็จและการชำระที่ร้าน แล้วส่งออเดอร์ เก็บลิงก์ติดตามไว้เป็นส่วนตัว ตะกร้าและ quote ไม่กันสินค้า
6. Owner/Manager/Cashier เปิด `/manage/online-orders` หรือ `/work/online-orders` ตาม workspace/สาขาที่มีสิทธิ์ กด **เริ่มเตรียมสินค้า** → **พร้อมรับสินค้า**; ลูกค้าติดตามความคืบหน้าได้
7. เมื่อลูกค้ามารับ พนักงานเปิดกะของตนบนเครื่องขายของออเดอร์ กด **ลูกค้ามารับ · เปิดเข้า POS** และ **เปิดตะกร้าออเดอร์นี้** ตรวจรายการ lot สต็อก ราคา/ส่วนลด แล้วรับชำระผ่านขั้นตอน POS เดิม
8. เมื่อ POS บันทึกขายสำเร็จ ออเดอร์จึงเป็น `COMPLETED` / `PAID_AT_STORE` พร้อมยอดสุดท้ายและเลขใบเสร็จจริง ไม่มีปุ่มทำให้ออเดอร์สำเร็จเอง

`/shop#online-status` ยังใช้ดูรายชื่อร้านที่เผยแพร่ได้ หากไม่มีร้าน จะเป็น empty state จริง ไม่แสดงสินค้าตัวอย่าง

## สถานะและการแก้ไข

- `PENDING → PREPARING → READY → COMPLETED`; ขั้นสุดท้ายเกิดจาก POS settlement เท่านั้น
- `REJECTED` / `CANCELLED` ต้องมีเหตุผลที่ลูกค้าอ่านได้ ออเดอร์ที่เชื่อม POS แล้วต้องจัดการการชำระค้างและยกเลิกตะกร้าโดยเจ้าของตะกร้าก่อน
- ยกเลิกตะกร้า POS จะปลดการเชื่อม ออเดอร์ยังเป็น READY ให้กลับมาตรวจและเปิดตะกร้าใหม่ได้ ไม่สร้างออเดอร์หรือขายซ้ำ
- ออเดอร์ที่ยังไม่เข้า POS หมดอายุหลัง 48 ชั่วโมง; ออเดอร์ที่เชื่อม POS จะไม่หมดอายุเงียบ ๆ ระหว่างรับชำระ
- ปิดรับออเดอร์ชั่วคราวได้ ร้านและการติดตามยังอยู่ เปลี่ยนเครื่องขาย/ซ่อนร้านไม่ได้ขณะมีออเดอร์ค้าง เปลี่ยน slug ไม่ได้เมื่อมีออเดอร์แล้ว เพื่อรักษาลิงก์ติดตามเดิม
- รายการและจำนวนในตะกร้า POS ของ online order ถูกล็อก แต่เลือก batch และทบทวนราคาล่าสุดได้ ถ้าต้องเปลี่ยนรายการ ให้ยกเลิกออเดอร์เดิมแล้วให้ลูกค้าสั่งใหม่

## Ownership และสัญญา

- Go `storefront` เป็นเจ้าของ publication, estimates, guest orders/tracking และ staff status; Go `pos` เป็นเจ้าของ cashier cart, shifts, payment, stock posting และ receipt
- `storefront.manage`: Owner/Manager; `online_orders.read/manage`: Owner/Manager/Cashier โดย API ตรวจ tenant และสาขาอีกครั้ง
- Public API `/api/v1/storefronts...` ไม่ใช้ employee session; public POST ตรวจ allowed Origin และ per-IP rate limit (quote/track 120 ครั้ง/นาที, create 20 ครั้ง/ชั่วโมง)
- Tenant API `/api/v1/organizations/{id}/storefront...` และ `/online-orders...` ใช้ session, CSRF สำหรับ write, permissions และ branch scope ดู [OpenAPI](../../packages/contracts/openapi.yaml)
- UUID `Idempotency-Key` เป็น order ID; fingerprint ผูกทั้ง request รวม quote/contact/access token การ retry body เดิมไม่สร้างออเดอร์ซ้ำ; body ที่ต่างกันถูกปฏิเสธ
- Token สุ่ม 32 bytes; ฐานเก็บ SHA256 เท่านั้น tracking link ใช้ fragment `#access=...`; browser ส่ง token ใน JSON POST ไม่ใช่ URL path/query Public response ไม่คืนชื่อ เบอร์ หมายเหตุ หรือ internal source IDs
- ตะกร้า localStorage แยกตาม slug ไม่เก็บ contact; sessionStorage เก็บเฉพาะ pending request ID/token เพื่อตรวจผลเมื่อเครือข่ายขาด ห้ามเผยแพร่ลิงก์/รหัสติดตาม
- Tables `storefronts`, `storefront_products`, `online_orders`, `online_order_items`, `online_order_events` มี tenant-scoped FK/FORCE RLS, immutable snapshots และ deferred consistency guards
- Availability ใช้ saleable quality balance หัก live online reservations ไม่รวม quarantine/recall/expired lot การกันจำนวนไม่ข้าม quality checks หรือยืนยัน lot/ราคาสุดท้าย

## Rollout และการตรวจ

Migration `000014_storefront.up.sql` เพิ่ม storefront เดิม และ `000015_online_reservations.up.sql` เพิ่ม reservation foundation โดยไม่แก้ migration ที่ใช้แล้วหรือข้อมูลขายย้อนหลัง API readiness ต้องตรง schema15 จึงต้องสำรองฐานและขออนุมัติ rollout ก่อน migrate/rebuild stack หลัก ห้ามใช้ `stack:up` เป็นคำสั่งทดสอบ เพราะรัน migrations อัตโนมัติ

การตรวจ integration ใช้ **เฉพาะ** isolated `smartpos-auth-test` และฐานใหม่ที่ยืนยันแล้ว:

```powershell
$env:AUTH_TEST_DATABASE='<confirmed-isolated-database>'
node tests/integration/storefront-flow.mjs
$env:E2E_BASE_URL='http://localhost:18088'
npm exec -- playwright test tests/e2e/storefront.spec.mjs --workers=1
```

ตั้งค่า test environment ตาม fixture เดิมก่อนใช้คำสั่ง Browser test ใหม่ต้องยืนยันฐานแยกเช่นเดียวกัน; อย่าใช้ placeholder หรือ primary ในคำสั่งจริง เอกสารนี้ไม่ถือเป็นอนุมัติให้ migrate/deploy/delete data
