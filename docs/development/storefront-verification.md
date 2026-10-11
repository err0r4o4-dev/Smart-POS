# Storefront pickup flow — local verification

วันที่ตรวจ: 2026-10-11 (Asia/Bangkok). เป็นงานขยาย flow สั่งสินค้าแล้วรับ/จ่ายที่ร้าน ไม่ใช่การรับรอง Production Ready หรือการเริ่ม Phase6–7

## ขอบเขตและ environment

- Guest catalog/cart/order/tracking → staff preparation → cashier-owned POS → real sale/payment/stock/receipt/order completion
- ใช้ `smartpos-auth-test` ที่ gateway `http://localhost:18088`, API18080, web15173, PostgreSQL15432 เท่านั้น
- สร้างฐานว่าง `smartpos_phase53_storefront_20261011_final` และ apply migrations1–14 จากศูนย์สำเร็จ จากนั้นชี้เฉพาะ test API ไปฐานนี้
- Primary stack/volume ที่ localhost8088 ไม่ได้ migrate/rebuild/deploy หรือแก้ข้อมูล ไม่มี commit/push/branch และไม่ติดตั้ง dependencies ใหม่ ใช้ dependency layers/browser/toolchain ที่มีอยู่
- ฐานทดสอบและ fixture ถูกเก็บไว้ ไม่ลบ/reset ข้อมูลหรือ volumes; test client containers ของแต่ละ fixture ปิดตาม cleanup เดิม

## ผลที่ตรวจจริง

| Check                                                | ผล                 | หลักฐาน/ขอบเขต                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh migrations1–14                                 | ผ่าน               | schema_migrations version14, dirty=false                                                                                                                                                                                                                                                                                                                                   |
| New tables FORCE RLS                                 | ผ่าน               | ตรวจ5/5 tables; foreign-tenant runtime read ไม่เห็นออเดอร์                                                                                                                                                                                                                                                                                                                 |
| `node tests/integration/storefront-flow.mjs`         | ผ่าน98 assertions  | opt-in publication, exact estimate, overstock/count/origin rejection, guest privacy, token denial, same-key concurrency, stale quote, RBAC/branch/tenant, status/revision, own shift, hold/resume, locked quantities, cancel/reimport, real sale, no double stock deduction, receipt, rejection reason, temporary closure, historical slug and tracking after unpublishing |
| `node tests/integration/pos-flow.mjs`                | ผ่าน132 assertions | existing checkout/stock/price/rollback/payment/shift/RBAC flow on schema14                                                                                                                                                                                                                                                                                                 |
| `node tests/integration/pos-safety.mjs`              | ผ่าน65 assertions  | existing races, price/unit changes, immutable sale records, ledger reconciliation                                                                                                                                                                                                                                                                                          |
| `npm test`                                           | ผ่าน               | frontend32 files/197 tests; contracts17 modules/113 routes                                                                                                                                                                                                                                                                                                                 |
| `npm run typecheck`                                  | ผ่าน               | TypeScript build-mode checks                                                                                                                                                                                                                                                                                                                                               |
| `npm run lint`                                       | ผ่านโดยมี warnings | 0 errors;3 existing react-refresh warnings in AuthProvider, OrganizationProvider, AuthPages                                                                                                                                                                                                                                                                                |
| Go `go test ./...`, `go vet ./...`, `go build ./...` | ผ่าน               | all API packages; Windows host toolchain                                                                                                                                                                                                                                                                                                                                   |
| Go formatting                                        | ผ่าน               | gofmt เฉพาะ Go files ในงาน                                                                                                                                                                                                                                                                                                                                                 |
| Docker test API/web build                            | ผ่าน               | frontendมี existing >500kB chunk warning; ไม่เพิ่ม scope เพื่อปรับ bundling                                                                                                                                                                                                                                                                                                |
| Browser `tests/e2e/storefront.spec.mjs`              | ผ่าน1 test         | real first-time setup → guest order → staff status → own-shift POS import → locked controls → CASH confirmation → sale → public paid status; source stock5.000→4.000                                                                                                                                                                                                       |
| Browser responsive                                   | ผ่าน               | catalog screenshots and cart overflow checks at390/768/1440px; ตรวจภาพจริง ไม่ใช้ build แทน browser evidence                                                                                                                                                                                                                                                               |
| Contract references/guards                           | ผ่าน               | session/CSRF boundary, guest rate limits/idempotency, hashed-token schema, public projection, Decimal refs, no manual completion                                                                                                                                                                                                                                           |

Frontend tests มี mocked API ตาม unit-test seam; integration/browser flow ด้านบนใช้ API/PostgreSQL จริงและข้อมูลสังเคราะห์ในฐานแยก ไม่ใช่ยอดขายของผู้ใช้

การเทียบ OpenAPI แบบ semantic ยืนยันว่า existing API paths/schemas ทั้งหมดคงเดิม; POSCart เพิ่มเฉพาะ optional online_order ตรวจ Prettier เฉพาะไฟล์ที่เปลี่ยน, gofmt และ git diff --check ผ่านหลังแก้ formatting test file ที่เหลือ

## สิ่งที่พบและแก้

- TypeScript unknown error เป็น ReactNode และ unit test คลิกก่อนโหลด settings เสร็จ
- Public rate limiter รับ scope ใหม่ไม่ได้เพราะ constraint เดิมอนุญาตเฉพาะ auth scopes; เพิ่ม scopes ใน migration14 แล้วตรวจ migrationฉบับสุดท้ายจากฐานว่างอีกครั้ง
- ร้านที่ยังไม่มี settings ส่ง404 ทำให้ไม่มี form สร้างครั้งแรก; เปลี่ยนเฉพาะ404 ของ settings เป็น initial state พร้อม regression coverage โดย403 ยังเป็น error
- รักษา tracking slug เมื่อมี historical order, ไม่ resume held cart ที่มี checkout ค้าง และตรวจ order consistency ใน sale settlement savepoint
- ช่องกรอก storefront เดิมไม่ได้รับ catalog form CSS; เพิ่ม scoped field styling แล้วตรวจภาพล่าสุด

## ข้อจำกัดและ failed attempts

- ชุด `quality-flow.mjs` ปฏิเสธก่อนเริ่มเพราะชื่อฐานไม่ตรง guard ที่ต้องการ dedicated Phase56 scratch DB จึง **ไม่ได้รัน/ไม่อ้างว่าผ่าน** ไม่แก้หรือข้าม guard; POS regression และ storefront/browser flow ที่ใช้ quality-aware stock ผ่านตามขอบเขตด้านบน
- ยังไม่ได้รัน Go race detector, full legacy browser suite, full quality suite, load tests, payment hardware หรือ production rollout
- ระหว่าง iteration เคยมี test expectation ไม่ตรง policy403/404/409 และ CartInput ของ POS; ตรวจ implementation แล้วแก้ตัวทดสอบให้ตรง ไม่ลด validation/authorization
- การเริ่ม test web ครั้งหนึ่งใช้พอร์ต default5173 และถูก Dockerปฏิเสธเพราะชน primary; แก้เป็น15173 เฉพาะ test project และรันผ่าน Primary containerไม่ถูกแทนที่
- ไม่รองรับ stock reservation, shipping, customer account หรือ online payment ยอดประมาณการยังต้องยืนยันล่าสุดที่ POS และเลือก lotตาม flowเดิม
- การใช้กับ localhost8088 ต้องสำรองฐานและอนุมัติ migration14/rebuild API+webก่อน ดู [คู่มือ](../architecture/storefront.md) ไม่ควรรัน stack:upกับฐานหลักเพียงเพื่อทดลอง
