# SmartPOS Phase 3 — รายงาน implementation และ verification

วันที่ยืนยันผล: **2026-10-10 (Asia/Bangkok)** เริ่มงานตาม execution context วันที่ 2026-10-09 และทำต่อหลังเที่ยงคืน ผลนี้เป็น **COMPLETED (Local)** ไม่ใช่ production release หรือ security certification

## 1. Implementation Summary

- POS ใช้ข้อมูลจริงจาก PostgreSQL: terminal, branch, stock source, product search/category/barcode, จำนวนคงเหลือ และ cart
- Cart เก็บฝั่ง server มี revision, เพิ่ม/แก้จำนวน/นำรายการออก, cancel, hold และ resume; hold ไม่กันสต็อกและ resume ต้องตรวจราคา/status/stock ใหม่
- รองรับ CASH, QR_MANUAL และ BANK_TRANSFER_MANUAL โดยแยก prepare quote, explicit funds confirmation และ complete sale ไม่สมมติว่าธนาคารยืนยันเงิน
- Sale/items/payment/receipt/Inventory SALE movements/balances/register cash/audit commit พร้อมกัน หาก posting ล้มเหลวหลังรับเงิน หลักฐานเงินยังอยู่ใน RECONCILIATION_REQUIRED
- มี sale history/details และ receipt snapshot พิมพ์/พิมพ์ซ้ำผ่าน browser ขนาด 58/80 mm; print failure ไม่ rollback หรือ repost sale
- เปิด/ปิด cashier shift, ตรวจ expected/counted cash/difference, ป้องกันปิดขณะมีเงินที่ยังไม่ reconcile และเก็บ history
- รักษา Phase 0–2, `/preview/pos`, Go modular monolith และ canonical 16 modules/106 routes; ไม่เริ่ม Phase 4

## 2. Repository Findings

- โปรเจกต์อยู่ที่ `D:\!Project\smartPOS(Web_Application)` บน branch `develop`; working tree สะอาดเมื่อเริ่มงาน งานทั้งหมดคงเป็น uncommitted diff
- Stack จริงคือ React/TypeScript/Vite/TanStack Query, Go/Chi/pgx, PostgreSQL, Caddy และ internal FastAPI เดิม ไม่เพิ่ม microservice/database/provider
- Identity/Organization มี session, Origin/CSRF, fixed RBAC, active membership/branch checks และ transactional audit ที่นำกลับมาใช้
- Catalog มี variant/SKU/barcode/unit และราคา NUMERIC(18,2); Inventory มี organization lock, append-only ledger, balance projection และ NUMERIC(18,3) ที่ใช้ต่อโดยไม่สร้าง stock engine ซ้ำ
- ใช้ migration ใหม่ `000006_pos_sales.up.sql`; migrations 000001–000005 ไม่เปลี่ยน Readiness ต้องเป็น schema 6 และไม่ dirty
- ตรวจจริงบน isolated Compose project `smartpos-auth-test`: gateway `http://localhost:18088`, API port 18080 และ web port 15173 ไม่ migrate primary stack/volume
- Go host ใช้ executable ที่ติดตั้งอยู่; container check ใช้ Go 1.26 มี Node 24/Chromium และ dependencies เดิมพร้อม ไม่ติดตั้ง framework ใหม่

## 3. Architecture Decisions

| หัวข้อ            | ข้อสรุปที่ implementation ใช้จริง                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terminal          | organization + branch + stock_location_id เดียว; Owner/Manager manage; remap ไม่ได้ขณะมี open shift หรือ active/held cart                                 |
| Stock source      | active WAREHOUSE/SALES_FLOOR/SHELF ใน branch เดียว ห้าม DAMAGED/QUARANTINE/IN_TRANSIT; ไม่ aggregate parent/child หรือ fallback อัตโนมัติ                 |
| Cart              | server persistence, cashier-owned/terminal-bound, optimistic revision; ACTIVE/HELD/COMPLETED/CANCELLED                                                    |
| Price authority   | active product/variant/unit และราคา Catalog ปัจจุบัน; expected_total เป็น stale-check ไม่ใช่ยอด authoritative                                             |
| Exact calculation | THB integer cents (`int64`), big-integer multiplication, quantity scale 1000, HALF_UP ต่อ line แล้วรวม; API เป็น decimal strings                          |
| Payment           | AWAITING_PAYMENT → CONFIRMED พร้อม acknowledged/actor/time/key/evidence; cash tender ต้องพอ manual ต้อง exact amount + reference                          |
| Atomic completion | transaction เดียวสร้าง sale/item/payment/receipt, post Inventory, update ledger-derived balance, net cash, cart/checkout และ audit                        |
| Failure boundary  | SAVEPOINT rollback settlement writes แต่ commit RECONCILIATION_REQUIRED; retry หรือ Owner/Manager บันทึก external funds resolution ไม่มี automatic refund |
| Idempotency       | UUID key + payload fingerprint + scoped uniqueness; retry คืน sale เดิม แม้ shift ปิดแล้ว ไม่รับเงิน/ตัด stock ซ้ำ                                        |
| Shift             | หนึ่ง open shift ต่อ terminal/หนึ่งต่อ cashier; expected_cash = opening_cash + completed CASH totals; difference = counted_cash - expected_cash           |

`organization.Service.Authorized` ล็อก organization ด้วย FOR UPDATE ร่วมกับ Catalog/Inventory/POS; ledger trigger เดิมล็อก balance และไม่ยอมให้ติดลบ ลำดับ variant posting deterministic การ serialize ต่อ tenant เลือก correctness ก่อน throughput และยังไม่มี production load benchmark

การเปลี่ยนราคาหลัง hold ต้องยอมรับราคาปัจจุบันก่อน prepare; การเปลี่ยนราคา/stock/สถานะหลัง funds confirmation ไม่ปล่อยให้ sale ผิดเงื่อนไข แต่เก็บ reconciliation เงิน Manual confirmation เป็นคำยืนยันของ operator เท่านั้น ไม่ใช่ bank/gateway proof

## 4. Database Changes

Migration ใหม่เพิ่มเก้าตาราง:

| ตาราง           | หน้าที่                                                          |
| --------------- | ---------------------------------------------------------------- |
| pos_terminals   | terminal และ stock source                                        |
| register_shifts | opening/closing, cashier, cash accounting                        |
| pos_carts       | owner/terminal/revision/lifecycle/idempotency                    |
| pos_cart_items  | variant/quantity/quoted price                                    |
| pos_checkouts   | frozen quote, fingerprint, funds confirmation และ reconciliation |
| sales           | immutable completed sale และ store/branch/cashier snapshots      |
| sale_items      | immutable product/unit/quantity/price snapshots                  |
| sale_payments   | immutable confirmed payment ต่อ sale                             |
| receipts        | stable immutable receipt identity ต่อ sale                       |

- เพิ่ม `stock_movements.sale_id` และ SALE ใน movement CHECK; movement ที่ไม่ใช่ SALE ไม่ถือ sale_id การตัด stock ผ่าน Inventory operation/ledger trigger เดิม ไม่ UPDATE balance โดยตรง
- Composite tenant/branch FKs ตรวจ terminal/shift/cart/checkout/sale/location ownership; CHECK ตรวจ quantity/money/state/evidence
- Unique constraints/indexes กัน terminal code ซ้ำ, open terminal/cashier shift ซ้ำ, live checkout ซ้ำ และ sale/payment/receipt/idempotency ซ้ำ
- History indexes รองรับ tenant/branch/time/id; list API จำกัดไม่เกิน 100 rows ต่อ page
- ทั้งเก้าตาราง ENABLE/FORCE organization RLS; absent/mismatched context เห็นไม่ได้ แต่ branch/cashier isolation ยังเป็น application policy
- Runtime grants: SELECT/INSERT/UPDATE เฉพาะ terminal/shift/cart/checkout; cart items เพิ่ม DELETE; sale/item/payment/receipt SELECT/INSERT เท่านั้น
- Immutable/history/INSERT guards กันแก้/ลบหรือ append ภายหลัง completion; deferred sale_consistency ตรวจ cart/shift/cashier, payment evidence, item sum, receipt, Inventory operation และ matching negative SALE movement
- Completion บังคับ consistency IMMEDIATE ก่อน commit; rollback ของ constraint จึงไม่ทำให้หลักฐานรับเงินจริงสูญหาย

Fresh chain ล่าสุดเริ่มสร้าง schema_migrations ก่อน migration 1 และผ่าน 1–6 ใน scratch `smartpos_phase3_final_62c78f20` ผล `6|f` และเก้าตารางมี RLS Scratch เก่าที่เก็บไว้คือ `smartpos_phase3_check_ca074073` ไม่ DROP/ลบข้อมูลใด ระหว่างพัฒนา migration 6 มี matching CHECK/guard/function amendments เฉพาะ isolated test DB; ไม่ใช่ขั้นตอน rollout production

## 5. Backend Changes

โมดูล `pos` เป็น application service สำหรับ terminals/carts/checkouts/shifts/sales/receipts; Catalog มี POS lookup port, Inventory มี SALE posting port และ Organization เพิ่ม fixed POS permissions ไม่มี stock logic ชุดที่สอง

API ทั้งหมดอยู่ใต้ `/api/v1/organizations/{id}` รวม **25 path templates / 28 operations**:

| Method     | Suffix                                                         |
| ---------- | -------------------------------------------------------------- |
| GET, POST  | /pos/terminals                                                 |
| PATCH      | /pos/terminals/{resourceId}                                    |
| GET        | /pos/products, /pos/barcodes/{code}, /pos/payment-methods      |
| GET        | /pos/shifts, /pos/shifts/{resourceId}                          |
| POST       | /pos/shifts/open, /pos/shifts/{resourceId}/close               |
| GET, POST  | /pos/carts                                                     |
| GET, PATCH | /pos/carts/{resourceId}                                        |
| POST       | /pos/carts/{resourceId}/hold, /resume, /cancel                 |
| POST       | /pos/checkout                                                  |
| GET        | /pos/checkouts, /pos/checkouts/{resourceId}                    |
| POST       | /pos/checkouts/{resourceId}/complete, /cancel, /resolve        |
| POST       | /pos/payments/{resourceId}/confirm                             |
| GET        | /sales, /sales/{resourceId}, /receipts, /receipts/{resourceId} |

`/resume`, `/cancel` และ `/resolve` ในตารางเป็น action ต่อ resource path ในแถวเดียวกัน ไม่ใช่ root endpoints ดู DTO/decimal strings/pagination/error/security ใน OpenAPI เพิ่ม POS schemas 25 ชนิดและ SALE movement โดยคง existing contract semantics

JSON input bounded 64 KiB/unknown-field rejection, bounded strings/UUID/quantity/money, request timeout, active membership/branch/unit revalidation และ explicit method permission; errors คืน generic envelope ส่วน internal diagnostic บันทึก SQLSTATE/constraint/table ไม่ log credentials/payment reference

## 6. Frontend Changes

| Route                 | งานที่ใช้งานได้จริง                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| /pos                  | terminal/current shift, search/category/keyboard barcode, live availability, cart quantity/totals |
| /pos/held-carts       | hold list, resume และ cancel ภายใต้ owner/revision policy                                         |
| /pos/checkout         | frozen quote, cash/manual methods, explicit confirmation, completion/recovery                     |
| /pos/register/open    | terminal setup และ counted opening cash                                                           |
| /pos/register/close   | pending gate, counted cash, expected/difference และ close retry                                   |
| /pos/register/history | paginated scoped history                                                                          |
| /pos/shifts           | scoped shifts/pending checkouts และ authorized reconciliation                                     |
| /sales                | paginated branch/cashier sale history                                                             |
| /sales/:id            | immutable sale/payment/items/details                                                              |
| /receipts             | committed snapshot, 58/80 mm browser print/reprint                                                |

ใช้ Golden Amber Glass/Inter Variable/Noto Sans Thai เดิม, touch controls และ responsive tables; query keys user/organization/branch พร้อม request cancellation และ context-keyed workspace ไม่ส่ง cart เก่าข้าม branch/org Print CSS scoped ไม่กระทบ Catalog labels และ catch เมื่อ browser print unavailable

Product browsing แสดง first 25 + search/category, terminal selector first 25 และ location selector 100 เป็น bounded selection ไม่ใช่ infinite/paginated picker ทั้งหมด ส่วน held cart/shift/payment/sales history มี server pagination

## 7. Scoped Security Review

| ประเด็น           | ผลและหลักฐานท้องถิ่น                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tenant isolation  | session/membership checks + composite FKs + FORCE RLS; API และ direct runtime SQL cross-tenant denial ผ่าน                                       |
| Branch isolation  | assigned active branch, source in same branch, scope history/checkout; unauthorized/crossbranch/deactivated source ถูกปฏิเสธ                     |
| RBAC              | CASHIER เฉพาะ own cart/funds/sales/receipts/shifts; Owner/Manager manage/reconcile/close-other ตาม branch scope; staff ไม่มี POS grant ถูกปฏิเสธ |
| Replay            | duplicate/response-loss retry/concurrent completion คืน result เดิม; conflicting payload/key ปฏิเสธ ไม่มี duplicate sale/ledger/cash             |
| Payment tampering | ไม่เชื่อราคาหรือ total จาก client, exact amount, acknowledged flag และ actor/reference; current price/unit change ไม่ settle ผิด                 |
| Oversell          | concurrent cashiers, sale vs transfer/count และ injected failure ตรวจ nonnegative balance และ ledger sum ผ่าน                                    |
| Register          | one-open uniqueness, pending close gate, sale/close race และ cash vs manual accounting ผ่าน                                                      |
| History           | runtime mutation/append/FK guards และ receipt snapshot หลังเปลี่ยนชื่อ/ราคา ผ่าน                                                                 |
| Session/browser   | Origin/CSRF, suspended membership (404 tenant hiding), revoked session (401), cache switch และ print failure ผ่าน                                |

ผล review ไม่ใช่ full penetration test/compliance/production hardening Organization RLS ไม่ได้ครอบคลุม branch/cashier ด้วยตัวเอง และ local bootstrap DB user ยัง privileged แม้ application SET ROLE smartpos_runtime ต้อง provision dedicated runtime LOGIN ก่อน production

## 8. Changed Files

สร้างใหม่ 29 files และแก้ existing 18 files รวม 47 files ใน scope (ไม่รวม ignored build/test artifacts)

### สร้างใหม่

```text
apps/api/internal/modules/catalog/pos.go
apps/api/internal/modules/inventory/sales.go
apps/api/internal/modules/organization/pos_policy_test.go
apps/api/internal/modules/pos/domain.go
apps/api/internal/modules/pos/domain_test.go
apps/api/internal/modules/pos/service.go
apps/api/internal/modules/pos/registers.go
apps/api/internal/modules/pos/carts.go
apps/api/internal/modules/pos/checkouts.go
apps/api/internal/modules/pos/sales.go
apps/api/internal/modules/pos/queries.go
apps/api/internal/modules/pos/http.go
apps/web/src/features/pos/POSContext.ts
apps/web/src/features/pos/POSWorkspace.tsx
apps/web/src/features/pos/POSPages.tsx
apps/web/src/features/pos/SalesPages.tsx
apps/web/src/features/pos/Receipt.test.tsx
apps/web/src/lib/pos-api.ts
apps/web/src/lib/pos-api.test.ts
apps/web/src/styles/pos.css
database/migrations/000006_pos_sales.up.sql
tests/integration/pos-fixtures.mjs
tests/integration/pos-flow.mjs
tests/integration/pos-safety.mjs
tests/e2e/pos.spec.ts
docs/architecture/pos.md
docs/business-flows/pos-checkout.md
docs/database/sales-transactions.md
docs/development/phase3-verification.md
```

### แก้ existing

```text
apps/api/internal/modules/organization/policy.go
apps/api/internal/platform/database/database.go
apps/api/internal/transport/router.go
apps/web/src/app/router.tsx
apps/web/src/app/routes.ts
apps/web/src/main.tsx
packages/contracts/openapi.yaml
scripts/check-contracts.mjs
package.json
README.md
TODO.md
docs/architecture/overview.md
docs/architecture/modules.md
docs/architecture/routes.md
docs/architecture/roadmap.md
docs/database/overview.md
docs/development/verification.md
docs/security/security-model.md
```

OpenAPI diff มี formatting/alignment churn แต่เปรียบเทียบ parsed HEAD กับ working tree แล้ว old paths/components เหมือนเดิม ยกเว้น InventoryMovement เพิ่ม SALE Contract checker เดิมคง assertions และเพิ่ม POS checks ไม่ลบ/ลด security tests Historical verification reports เก็บไว้ ไม่สร้าง repository rules/AGENTS.md หรือ workflow tracker ใหม่

## 9. Verification Results

### Commands และผลที่รันจริง

| Check / command                                                                                                   | ผล                   | หลักฐานและข้อจำกัด                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                                                                                        | PASSED               | Vitest 13 files / 64 tests รวม exact POS DTOs/receipt snapshots; contract checker ผ่าน                                                                  |
| `npm run contracts:check` (ผ่าน npm test)                                                                         | PASSED               | canonical 16 modules/106 routes, POS paths/schemas/errors/security; additive existing semantics ตรวจแยกด้วย parsed comparison                           |
| `npm run typecheck`                                                                                               | PASSED               | tsc project build ไม่ error                                                                                                                             |
| `npm run lint`                                                                                                    | PASSED WITH WARNINGS | 0 errors, 3 existing Fast Refresh warnings ที่ AuthProvider/OrganizationProvider/AuthPages; POS warning ใหม่แก้ด้วย POSContext แล้ว                     |
| `npm run build`                                                                                                   | PASSED WITH WARNING  | TypeScript/Vite production build; main JS 524.48 kB, warning >500 kB ไม่ suppress threshold                                                             |
| `C:\Program Files\Go\bin\go.exe test ./...` ใน apps/api                                                           | PASSED               | host Go unit/regression ทั้ง packages ในช่วง implementation                                                                                             |
| `docker compose -p smartpos-auth-test --profile checks run --build --rm api-check`                                | PASSED               | final check container รัน gofmt-l clean, go vet ./..., go test -race ./..., go build ./cmd/server; package pos และ existing packages ผ่าน               |
| `npm run verify:pos`                                                                                              | PASSED               | final real API/PostgreSQL: pos-flow 132 + pos-safety 65 = 197 assertions; safety count อาจต่างตาม race outcome branch ที่ตรวจ                           |
| `node scripts/check-auth.mjs`                                                                                     | PASSED               | final Playwright 17/17 ด้วย AUTH_E2E=1, real fixture proxy/gateway/DB ไม่ mock POS API                                                                  |
| `node tests/integration/auth-flow.mjs`                                                                            | PASSED               | auth/reset/revocation/expiry, spoofing/direct rate limits, Mailpit outage/restoration และ sanitized logs ในช่วง regression                              |
| `node tests/integration/organization-flow.mjs`                                                                    | PASSED               | real organization/branch/member/RBAC regression                                                                                                         |
| `node tests/integration/catalog-flow.mjs`                                                                         | PASSED               | 116 assertions รวมเดิม                                                                                                                                  |
| `node tests/integration/inventory-flow.mjs`                                                                       | PASSED               | 135 assertions รวมเดิม                                                                                                                                  |
| `docker compose -p smartpos-auth-test build api web`                                                              | PASSED               | production images build ในช่วง implementation; recreate เฉพาะ isolated api/web --no-deps                                                                |
| Fresh SQL chain: `docker exec ... createdb`, init schema_migrations, `psql -v ON_ERROR_STOP=1` ทีละ migration 1–6 | PASSED               | latest migration ใน retained scratch smartpos_phase3_final_62c78f20, clean tracker6 และเก้าตาราง RLS; เป็น raw SQL validation ไม่ใช่ production rollout |
| API/SQL RLS/grants/FK/immutable guards/reconciliation assertions                                                  | PASSED               | runtime-role SQL ตรวจใน isolated test DB รวมใน POS suites                                                                                               |
| `docker compose -p smartpos-auth-test config --quiet`                                                             | PASSED               | configuration valid                                                                                                                                     |
| `docker exec smartpos-auth-test-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`         | PASSED               | local gateway config valid; ไม่ใช่ production TLS gate                                                                                                  |

การเปิด terminal, ยืนยันเงิน และ SQL fault injection ทั้งหมดใช้ synthetic test data ใน isolated DB เท่านั้น ไม่ใช่การชำระเงินจริงหรือ operation บน production

Final repository checks: `npm run format:check` และ `git diff --check` PASSED; Prettier ตรวจทั้ง repo โดย format เฉพาะ changed supported files Parsed OpenAPI comparison กับ HEAD ผ่าน โดยคงทุก existing path/component ยกเว้น SALE enum ตรวจ 18 modified + 29 new files ตรงรายการ section8, migrations1–5 ไม่เปลี่ยน และ encoding scan ไม่พบ replacement/broken Thai characters

### Critical concurrency/failure evidence

| Scenario                                      | ผลที่ตรวจจริง                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| สอง cashier แย่ง stock เดียว                  | มีเพียง sale ที่ stock พอสำเร็จ อีก checkout reconcile; ไม่ negative/oversell                          |
| duplicate checkout/complete และ lost response | sale/payment/receipt/ledger/cash เกิดชุดเดียว; replay คืน sale เดิม                                    |
| injected failure หลัง ledger                  | sale/items/payment/receipt/movements/balances/cash rollback ทั้งชุด แต่ durable funds evidence ยังอยู่ |
| sale vs transfer                              | organization lock ทำให้ไม่ใช้ stock เดียวซ้ำ; conservation/nonnegative/ledger reconciliation ผ่าน      |
| sale vs physical count                        | sale ทำให้ snapshot version stale; count posting ต้อง recount ไม่ overwrite sale                       |
| sale vs shift close                           | ไม่ close ก่อน resolve pending; เมื่อ close สำเร็จรวม cash sale ที่ commit แล้ว                        |
| price/unit/status เปลี่ยน                     | ไม่ prepare/settle invalid quote; held cart ตรวจปัจจุบัน และ receipt เดิมไม่เปลี่ยน                    |
| manual confirm retry/print fail               | ไม่ invent callback/ไม่ confirm ซ้ำ; print failure ไม่เปลี่ยน sale/stock                               |

Concurrency ใช้ real HTTP/DB integration ไม่ใช่ Go race detector เพียงอย่างเดียว กรณี race/rollback/RLS ส่วนใหญ่ตรวจใน backend suites; ไม่อ้างว่ามี browser scenario แยกสำหรับทุก race

### Browser และ visual evidence

Playwright ทั้ง 17 tests ครอบคลุม foundation/auth/organization/catalog/inventory และ POS workflow หนึ่ง test หลายขั้นตอน: เปิดกะ, unknown/known barcode, add/edit cart, hold/resume, cash/manual methods, sales/details/receipt, unavailable print/reprint, cash reconciliation, close, branch switch และ unauthorized staff

ตรวจสิบ POS/Sales routes ที่ 320/375/640/768/1024/1440/1920 px และไม่เกิด page-level horizontal overflow Table ใช้ scoped scroll container ตรวจภาพจริง POS 375/1440 และ receipt 58/80 mm: typography/card/amber controls อ่านได้, loaded products และ closed-shift disabled state ไม่ clip; receipt ยอด4.00/รับ10.00/ทอน6.00 สอดคล้อง committed sale

Artifacts อยู่ใต้ `test-results/pos-Phase-3-real-POS-funds-e81e9-r-and-responsive-boundaries/` ได้แก่ `pos-375.png`, `pos-1440.png`, `receipt-58mm.png`, `receipt-80mm.png` เป็น ignored artifacts ที่ E2E รอบถัดไปอาจ overwrite ไม่ใช่ hardware-print proof

### Failures ที่พบและแก้แล้ว

- Migration ใหม่ลืม SALE ใน stock movement CHECK ทำให้ completion เข้า reconciliation: แก้เฉพาะ migration 6 และ matching isolated CHECK ไม่แก้ migration 5
- Expected drawer cash ของ test ไม่รวม recovered multi-item sale 2.25: แก้ expected104.25/difference-4.25 พร้อม assertion เพิ่ม ไม่เปลี่ยน accounting เพื่อให้ test ผ่าน
- Receipt print CSS กระทบ Catalog labels และ specificity ซ่อน receipt: scope body:has(.pos-receipt) ให้ถูก ทั้ง label และ receipt regression ผ่าน
- Register history overflow mobile: เพิ่ม scoped horizontal scroll/min-width; สิบ routes/seven widths ผ่าน
- Suspended membership expected403 ไม่ตรง tenant-hiding404 และ zero price fixture ขัด CHECK เดิม: tests ตรวจ behavior/positive-price rejection จริง ไม่ถอด constraint
- Fast Refresh warning ใหม่ของ POSWorkspace: แยก context/hook ออก POSContext ไม่แตะสาม warnings เดิม
- Vitest/Git child process sandbox EPERM และ Docker pipe denied: rerun ผ่าน approved escalation ไม่เปลี่ยน sandbox/agent configuration
- Fresh raw SQL รอบแรกไม่มี schema_migrations ของ runner: init tracker แล้วผ่าน chain; รอบ final เริ่ม prerequisite ตั้งแต่ก่อน migration 1

ทั้งหมดนี้เป็น resolved attempts ไม่ใช่ current failing gates ไม่ลด/ลบ/skip tests เดิมเพื่อให้ผลผ่าน

## 10. Limitations

- ผลเป็น local acceptance เท่านั้น; ไม่ run remote CI, deploy, production TLS/secrets/SMTP, backup restore, production migration หรือ throughput/soak benchmark
- Manual QR/transfer เป็น cashier acknowledgement ไม่ยืนยันกับธนาคาร; reference ไม่ใช่ settlement proof หากรับเงินจริงแล้ว posting ไม่สำเร็จต้อง monitor/reconcile ภายนอก
- รองรับ THB, one payment ต่อ sale, positive selling price; ไม่มี split/card/gateway/refund/void/discount/separate tax และ receipt ไม่ใช่ tax invoice
- Hold ไม่ reserve; terminal ใช้ source เดียว ไม่มี automatic replenishment/parent-child aggregation/shared cashier shift/cash-in-out
- Product/terminal/location selectors ยัง bounded ตาม section6; ยังไม่มี comprehensive large-catalog picker UX/performance trial
- ไม่ทดสอบ physical scanner, thermal printer, cash drawer, actual paper page sizing หรือ bank environment Browser Enter/print tests ไม่ทดแทน hardware acceptance
- Branch/cashier scope เป็น application policy; privileged DB administrators ยังต้องแยก credentials/access/monitoring Local Compose bootstrap privileged ไม่ production-safe
- Payment/audit/reference/cart data retention/cleanup และ reconciliation alerting/runbook ต้องกำหนดก่อนใช้งานจริง ไม่มี durable external outbox/payment-provider integration
- Per-organization locking มี trade-off throughput; UI accessibility/contrast/focus ที่ตรวจไม่ใช่ full WCAG certification
- Main JS chunk warning >500 kB และสาม existing lint warnings ยังอยู่ ไม่แก้นอก scopeหรือเพิ่ม threshold ปิด warning
- Python AI ไม่เปลี่ยน; ไม่ rerun Python unit/AI outage resilience เป็น Phase 3 evidence หลัก ผล Phase 0 เดิมเก็บใน historical report AI ไม่มี authority ต่อ checkout/stock/payment
- Test stack และ scratch DB/fixture data เก็บไว้; ไม่ down -v/drop/reset/ลบข้อมูลหรือ primary volume ไม่มี commit/branch/push/deployment

## 11. Phase Status

| Phase                             | Status            | ขอบเขตหลักฐาน                                              |
| --------------------------------- | ----------------- | ---------------------------------------------------------- |
| Phase 0                           | COMPLETED (Local) | historical foundation + final browser regression           |
| Phase 1A                          | COMPLETED (Local) | auth API/browser regression ผ่าน                           |
| Phase 1B                          | COMPLETED (Local) | organization/RBAC API/browser regression ผ่าน              |
| Phase 1C                          | COMPLETED (Local) | catalog116 assertions + browser regression                 |
| Phase 2.1–2.6 / Overall           | COMPLETED (Local) | inventory135 assertions + browser/regression/integration   |
| Phase 3.1 POS Terminal            | COMPLETED (Local) | real source-bound terminal/search/barcode                  |
| Phase 3.2 Shopping Cart           | COMPLETED (Local) | persistent revisioned cart/hold/resume                     |
| Phase 3.3 Checkout/Payments       | COMPLETED (Local) | exact calculation, explicit durable cash/manual funds      |
| Phase 3.4 Sales/Inventory         | COMPLETED (Local) | atomic SALE posting, idempotency/rollback/concurrency      |
| Phase 3.5 Receipts/History        | COMPLETED (Local) | immutable snapshot, browser print/reprint/details          |
| Phase 3.6 Registers/Shifts        | COMPLETED (Local) | opening/closing/reconciliation/pending gate                |
| Phase 3.7 Integration/Security/QA | COMPLETED (Local) | SQL/API/Go race/unit/contracts/build/browser/scoped review |
| Phase 3 Overall                   | COMPLETED (Local) | verified gates ภายใน scope พร้อมข้อจำกัด section10         |
| Phase 4                           | NOT STARTED       | ไม่มี supplier/PO/receiving/replenishment implementation   |

## 12. Next Steps

1. ก่อน rollout ให้ผู้รับผิดชอบอนุมัติ backup/restore rehearsal, migration6 แยก credentials และตรวจ readiness/ledger/reconciliation หลัง apply บน staging ไม่แก้ applied migrations
2. Provision distinct least-privilege runtime LOGIN/migration identity, TLS, secrets, SMTP, observability และ restricted payment-reference/audit retention
3. ทำ operational UAT กับเงินจริงโดยมี reconciliation procedure, scanner/printer/cash drawer, paper widths, accessibility, large catalog และ multi-cashier load
4. วัด organization-lock throughput และออกแบบ optimization ภายหลังมี evidence โดยไม่ลด atomicity/authorization/idempotency
5. Phase 4 — Supplier Management, Purchase Orders, Goods Receiving, Warehouse Replenishment & Shelf Management สามารถใช้ Catalog/Inventory ports และ stock identity เดิมเป็นฐาน แต่ต้องมีคำสั่งและ acceptance scope แยก ไม่เริ่มโดยอัตโนมัติ

เอกสารประกอบ: [POS architecture](../architecture/pos.md), [checkout flow](../business-flows/pos-checkout.md), [sales transactions](../database/sales-transactions.md), [security model](../security/security-model.md) และ [historical verification](verification.md)
