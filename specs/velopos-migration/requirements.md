# VELOPOS migration requirements reconciliation

Status: APPROVED SCOPE RECONCILED; implementation compliance is not certified.
Audit date: 2026-11-19 (Asia/Bangkok)
Approval source: [approved-requirements.md](approved-requirements.md)
Register ID: VELOPOS-SCOPE-BASELINE-001
Approval authority: project owner, as identified by the user and source register.
Source SHA-256: fb144837c29f2c3c97428844a60bb4ee8de0b844396f2479c1d0426218419e74
Repository baseline: feature/fix-system-, HEAD 99afebaa8b2f1287ed61035339f5cf55b0dbfab0.
Initial Git status reported no changes. Git warned that the user-global ignore
file was unreadable; no Git configuration or permissions were changed.

## 1. Result and evidence boundary

All 92 approved requirement headings are present exactly once, in order from
VLP-001 to VLP-092, with matching Scope numbers, recorded A/B/C/D selections,
non-placeholder approved statements and derived verification intents. Each
requirement below preserves its approved statement and selection verbatim and
links current evidence, design ownership and future executable tasks.

The register is a compiled approval record, not the original conversation
transcript or implementation evidence. Original transcript, independent approval
signature/date and item priorities are not supplied; none is invented or made
a new prerequisite for importing the baseline. Derived verification intents
remain interpretations for test design, not extra approved features. Additional
specific acceptance cases in design/tasks are proposed engineering checks.

Current static classification: **2 IMPLEMENTED, 49 PARTIAL, 35 MISSING,
6 CONFLICTING, 0 OBSOLETE**. The two IMPLEMENTED entries are static exclusion
checks for no LINE and no referral program, not live behavioral certifications.
No application, browser, database, provider or infrastructure acceptance tests
ran. No full-feature requirement is claimed to have fresh runtime acceptance.

Definitions:

- IMPLEMENTED: current inspected evidence covers the stated scope; where limited
  to a static exclusion, that limitation is explicit. It is not release readiness.
- PARTIAL: a concrete reuse seam exists but at least one required flow, invariant
  or acceptance result is missing.
- MISSING: no matching implementation was found in the bounded owner/module,
  contract and schema audit. This is not an assertion about uninspected systems.
- CONFLICTING: a current behavior/representation would violate an approved rule
  if reused unchanged for the new flow. Legacy retention is not itself a defect.
- OBSOLETE: a confirmed retired surface only; none is newly classified obsolete.

## 2. Settled scope and corrections to the previous draft

- One restaurant per checkout; independent restaurants per owner, one Owner per
  restaurant, one physical site/primary market, no new branch/staff/co-owner model.
  B01 mapping approved by the user on 2026-11-19: Option A, one organization
  per restaurant; one Owner may manage separate organizations. Legacy branch
  compatibility, retained-data validation and schema acceptance remain pending.
- Provider-confirmed PromptPay with direct merchant food settlement; manual
  merchant food refunds. Platform Pro/ads billing and refunds are separate.
  Do not add food cash/manual-paid/slip confirmation or food-order commissions.
- One restaurant FIFO across Dine-in, Takeaway, Pickup and self-Delivery, ordered
  by verified successful payment time. Kitchen is whole-order; payment, kitchen
  and fulfillment are distinct, with verified handover for Completed.
- Optional Guest/member access, advanced marketplace/admin/ads/AI/analytics,
  loyalty, chat, PWA and operations are approved scope, not unapproved candidates.
  Sequencing does not approve a reduced MVP or permit removing any of the 92.
- Exclude mixed-restaurant checkout, platform riders/GPS, LINE/LIFF, scheduled
  pickup, ingredient inventory requirements, auto overload pause/threshold alerts,
  autonomous AI order/payment, referral rewards, automatic No-Show refunds,
  mandatory advanced attribution/ML fraud/HA failover, direct thermal/auto-print
  and full tax invoice/e-Tax. Preserve legacy data/dependencies until acceptance.
- Scope 93 menu images/media management remains unapproved. Existing media
  fields and approved storefront banners/gallery do not add that future scope.

Keep browser -> Go -> PostgreSQL and internal AI boundaries, exact money/quantity
units, existing server authorization/tenant isolation, immutable records,
idempotency and atomic effects. Preserve current paid/hold/refund/reconciliation
kitchen safeguards until tested replacement acceptance. No runtime policy or
review requirement is changed by this documentation task.

## 3. Current repository evidence

These are current source observations at the baseline HEAD, not historical test
passes. Application source, API contracts, schema and test seams were read only.
No credentials/environment values, retained databases or external services were
read or changed. Current runtime schema readiness is UNKNOWN; source requires
version 39. The route inventory contains 18 modules and 115 route entries,
correcting the old draft's inconsistent 109/115 counts. Parity still needs audit.

Paths are repository-root relative. E16 scans were limited to .go/.ts/.tsx/.sql/
.yaml/.json/.py in the listed roots; targeted lookups were read in context.
Generic line/transfer/archive matches were not treated as LINE, owner-transfer
or restaurant-archival implementations. Existing test files identify candidate
checks; their presence does not establish a PASS.

| Evidence | Area                                      | Inspected paths                                                                                                                                                                                                                                                                                                                                     | Observation and limit                                                                                                                                                                                                                                                                                                                                                                                              |
| -------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E01      | Identity and tenant authority             | `apps/api/internal/modules/organization/policy.go`; `apps/api/internal/modules/organization/members.go`; `database/migrations/000001_foundation.up.sql`                                                                                                                                                                                             | Current OWNER-only capability grant; organization/branch membership and scoped audit exist. This does not establish platform Admin/MFA or independent restaurant mapping.                                                                                                                                                                                                                                          |
| E02      | Restaurant setup and menu                 | `apps/api/internal/modules/restaurant/setup.go`; `apps/api/internal/modules/restaurant/organization_setup.go`; `apps/api/internal/modules/restaurant/organization_menu.go`; `apps/api/internal/modules/storefront/organization_settings.go`                                                                                                         | Organization-native profile/menu setup coexists with branch fields. Current ServiceModes lacks a distinct Pickup flag; SetupMenuItemInput has no modifier groups.                                                                                                                                                                                                                                                  |
| E03      | Guest order, cart, favorites and events   | `apps/api/internal/modules/storefront/orders.go`; `apps/api/internal/modules/storefront/domain.go`; `apps/web/src/features/storefront/shop-cart.ts`; `apps/web/src/features/storefront/shop-favorites.ts`                                                                                                                                           | Per-slug local storage, hashed tracking-token comparison, request fingerprint replay, item snapshots and status events exist. These are not member sync, claims or smart reorder.                                                                                                                                                                                                                                  |
| E04      | Tables and delivery                       | `apps/api/internal/modules/storefront/orders.go`; `apps/api/internal/modules/storefront/domain.go`; `apps/api/internal/modules/storefront/organization_quote.go`; `apps/api/internal/modules/storefront/delivery_integration_test.go`; `apps/api/internal/modules/storefront/dine_in_test.go`                                                       | Table binding, delivery address and flat fee are present. Tests are source seams only, not fresh runs. No channel handover/radius contract was found.                                                                                                                                                                                                                                                              |
| E05      | Queue and kitchen predicates              | `apps/api/internal/modules/restaurant/queue.go`; `apps/api/internal/modules/restaurant/period.go`; `apps/api/internal/modules/storefront/orders.go`; `apps/api/internal/modules/storefront/domain.go`; `apps/api/internal/modules/restaurant/queue_test.go`                                                                                         | queueQuery requires PAID/unreleased hold and excludes specified refund/FULFILLMENT_REVIEW states. Ordering uses issued_at/created_at; AssignQueueNumber uses clock_timestamp().                                                                                                                                                                                                                                    |
| E06      | Payment and recovery                      | `apps/api/internal/platform/stripe/customer.go`; `apps/api/internal/platform/stripe/checkout.go`; `apps/api/internal/modules/storefront/payments.go`; `apps/api/internal/modules/storefront/payment_checkout.go`; `apps/api/internal/modules/storefront/payment_reconciliation.go`; `apps/api/internal/modules/storefront/customer_payment_http.go` | CustomerPurpose is online_order_test_payment, customer method is card and live mode is rejected. Separate connection-test checkout mentions PromptPay. Neither proves production merchant-direct PromptPay. Legacy expiry/dispatch windows are not approved policy values.                                                                                                                                         |
| E07      | Cancellation and refunds                  | `apps/api/internal/modules/storefront/payment_refunds.go`; `apps/api/internal/platform/stripe/customer_refund.go`; `apps/api/internal/modules/storefront/domain.go`; `apps/api/internal/modules/storefront/orders.go`                                                                                                                               | Existing test customer refunds invoke a provider gateway; current owner transition map permits cancellation from PENDING/PREPARING/READY. A distinct customer request/approval/manual food-refund model is absent.                                                                                                                                                                                                 |
| E08      | Directory and search                      | `apps/api/internal/modules/storefront/http.go`; `apps/api/internal/modules/storefront/catalog_browse.go`; `apps/api/internal/modules/storefront/catalog.go`                                                                                                                                                                                         | Public directory and catalog filters cover text/category/price/availability. Current quote checks published/accepting_orders; this is not central approval or community/geo discovery.                                                                                                                                                                                                                             |
| E09      | Polling and consent                       | `apps/web/src/features/storefront/ShopTrackingPage.tsx`; `apps/web/src/features/restaurant/restaurant-hooks.ts`; `apps/api/internal/modules/customers/domain.go`                                                                                                                                                                                    | Tracking and kitchen hooks poll; retail customer record has marketing_consent Boolean. No granular notification consent/history/push implementation was found.                                                                                                                                                                                                                                                     |
| E10      | Assistant and AI boundary                 | `apps/web/src/features/storefront/VeloAssistantChat.tsx`; `apps/ai/app/main.py`                                                                                                                                                                                                                                                                     | Assistant seeds conversation, uses keyword replies and fallback slug yam; FastAPI has only health endpoints. UI appearance is not grounded AI acceptance.                                                                                                                                                                                                                                                          |
| E11      | Pricing and loyalty reuse                 | `apps/api/internal/modules/pricing/service.go`; `apps/api/internal/modules/pricing/approvals.go`; `apps/api/internal/modules/loyalty/domain.go`; `apps/api/internal/modules/loyalty/posting.go`; `apps/api/internal/modules/loyalty/redemption.go`                                                                                                  | Retail pricing/points and reversal/debt seams exist. PostSale uses committed sale grand_total; it does not check verified restaurant handover/Completed.                                                                                                                                                                                                                                                           |
| E12      | Receipts and print reuse                  | `apps/web/src/features/pos/SalesPages.tsx`; `apps/web/src/features/restaurant/StockAndTables.tsx`; `apps/api/internal/modules/storefront/orders.go`; `apps/api/internal/modules/pos`                                                                                                                                                                | Browser print and retail sale/receipt links exist; restaurant-native paid receipt, kitchen ticket and verified handover acceptance remain gaps.                                                                                                                                                                                                                                                                    |
| E13      | Language, UI and test seams               | `apps/web/src/i18n`; `apps/web/src/app/language.tsx`; `apps/web/src/styles/tokens.css`; `tests/e2e`; `playwright.config.ts`                                                                                                                                                                                                                         | Thai/English UI modules, tokens and browser-test seams exist. No rendering, real-device, accessibility conformance or browser acceptance was performed here.                                                                                                                                                                                                                                                       |
| E14      | Import, revisions and availability        | `apps/api/internal/modules/catalog/imports.go`; `apps/api/internal/modules/catalog/import_test.go`; `apps/api/internal/modules/storefront/catalog.go`; `apps/api/internal/modules/restaurant/organization_menu.go`                                                                                                                                  | CSV/XLSX preview/import, revision counters, sold-out flags and catalog-backed menus exist. Modifier-aware revision restore and dish quotas are not established.                                                                                                                                                                                                                                                    |
| E15      | Operations and verification configuration | `apps/api/internal/platform/database/database.go`; `apps/ai/app/main.py`; `.github/workflows/ci.yml`; `infra/caddy/Caddyfile`; `package.json`                                                                                                                                                                                                       | RequiredVersion=39 and migration files end at 39. CI defines local/build/integration checks, not evidence they ran or proof of rolling-release/PITR/observability acceptance.                                                                                                                                                                                                                                      |
| E16      | Bounded missing-feature/exclusion scan    | `apps/api/internal/modules`; `apps/web/src`; `database/migrations`; `packages/contracts`; `apps/ai/app`                                                                                                                                                                                                                                             | Current module inventory and targeted source/contract/schema scans found no ad_wallet/ad_campaign/market_id/community_id, referral, handover/No-Show, MFA/TOTP/WebAuthn, guest-claim/support-dispute, or PWA registration implementation. No LINE/LIFF identifiers/hosts were found using case-aware LINE matching. Missing means not found in these inspected seams, not a proof about every possible deployment. |
| E17      | Identity implementation                   | `apps/api/internal/modules/identity/http.go`; `apps/api/internal/modules/identity/security.go`; `apps/api/internal/modules/identity/google_http.go`; `apps/api/internal/modules/identity/login_reset_test.go`                                                                                                                                       | Email/password, verification, session/recovery and Google route seams exist. Test source was inspected, not executed; privileged MFA and secure transfer remain unaccepted.                                                                                                                                                                                                                                        |

## 4. Approved requirement-by-requirement reconciliation

Every item uses the source's exact statement and selected option. All links are
planning traceability; task presence is not implementation or test completion.

### VLP-001 - Single-Restaurant Checkout

- Source / approved decision: [approved register](approved-requirements.md), Scope 01 / **A**.
- **Approved requirement:** ลูกค้าเลือกสินค้าและชำระเงินต่อหนึ่งร้านอาหารในหนึ่ง Checkout เท่านั้น สามารถมีออเดอร์ของร้านอื่นแยกกันได้ แต่ห้ามรวมหลายร้านไว้ในธุรกรรมเดียว
- **Verification intent (derived, not a new decision):** Checkout ต้องมี restaurant_id เดียว; รายการต่างร้านต้องแยก Checkout และออเดอร์
- Current implementation: **PARTIAL**. Evidence: E03. Per-slug carts and organization-scoped order creation exist; the complete approved checkout, modifier and payment path is not accepted.
- Trace: [D06](design.md#d06); [T3.2](tasks.md#t3-2), [T4.2](tasks.md#t4-2).

### VLP-002 - Merchant Self-Delivery

- Source / approved decision: [approved register](approved-requirements.md), Scope 02 / **A**.
- **Approved requirement:** ร้านอาหารจัดส่งเอง ไม่มีระบบไรเดอร์หรือบริษัทขนส่งของแพลตฟอร์ม ร้านตั้งพื้นที่ให้บริการและค่าจัดส่งของตนเอง
- **Verification intent (derived, not a new decision):** คำสั่งซื้อ Delivery ระบุร้านเป็นผู้จัดส่ง; ไม่มีระบบรับงานไรเดอร์ของแพลตฟอร์ม
- Current implementation: **PARTIAL**. Evidence: E04. Delivery address and flat shipping fee exist; merchant service-area and complete self-delivery workflow remain gaps.
- Trace: [D09](design.md#d09); [T3.5](tasks.md#t3-5), [T4.2](tasks.md#t4-2).

### VLP-003 - Paid Before Queue

- Source / approved decision: [approved register](approved-requirements.md), Scope 03 / **A**.
- **Approved requirement:** ออเดอร์ต้องได้รับการยืนยัน Paid ที่เชื่อถือได้ก่อนเข้าสู่คิวครัว ออเดอร์ Pending หรือผลจ่ายไม่ชัดเจนต้องไม่เข้าคิว
- **Verification intent (derived, not a new decision):** ไม่มี Queue Entry ก่อน Verified Paid; การจ่ายที่ยืนยันแล้วไม่ถูกเพิ่มคิวซ้ำ
- Current implementation: **PARTIAL**. Evidence: E05, E06. Queue reads and PREPARING/READY transitions check PAID, unreleased hold, refund and FULFILLMENT_REVIEW predicates. Real-provider acceptance remains open.
- Trace: [D08](design.md#d08); [T3.3](tasks.md#t3-3), [T3.4](tasks.md#t3-4).

### VLP-004 - Provider-Verified PromptPay with Direct Merchant Settlement

- Source / approved decision: [approved register](approved-requirements.md), Scope 04 / **B**.
- **Approved requirement:** ใช้ Payment Provider เพื่อสร้าง PromptPay QR และยืนยันการชำระเงินอัตโนมัติ เงินค่าอาหารต้องเข้าร้านโดยตรง ไม่ผ่านบัญชีรับฝากของ VELOPOS; ต้องตรวจสอบว่า Provider รองรับรูปแบบการรับเงินของร้านที่สมัครจริง
- **Verification intent (derived, not a new decision):** Backend ใช้ผลยืนยันจาก Provider แทนการเชื่อสลิป/ผู้ใช้; เงินอาหารไม่ถูกพักใน Platform Wallet
- Current implementation: **PARTIAL**. Evidence: E06. Existing Stripe customer integration is explicitly test-payment code. PromptPay and direct settlement to each verified restaurant are not established.
- Trace: [D07](design.md#d07); [T3.3](tasks.md#t3-3).

### VLP-005 - Single Strict FIFO Queue Per Restaurant

- Source / approved decision: [approved register](approved-requirements.md), Scope 05 / **A**.
- **Approved requirement:** ร้านหนึ่งมีคิวออเดอร์เดียวรวม Dine-in, Takeaway, Pickup และ Delivery เรียงตามเวลา Paid ที่ได้รับการยืนยัน ห้ามให้ช่องทางใดแซงคิวหรือจัดลำดับเอง
- **Verification intent (derived, not a new decision):** คิวเดียวต่อร้าน; ลำดับคงตามเวลาชำระสำเร็จแม้สถานะครัวหรือช่องทางต่างกัน
- Current implementation: **CONFLICTING**. Evidence: E05. Current queue is branch/service-period scoped and sorts ticket issuance/order creation time. Assignment uses clock_timestamp(), not verified successful payment time.
- Trace: [D08](design.md#d08); [T3.4](tasks.md#t3-4).

### VLP-006 - Whole-Order Kitchen Status

- Source / approved decision: [approved register](approved-requirements.md), Scope 06 / **A**.
- **Approved requirement:** สถานะการทำอาหารใช้ระดับทั้งออเดอร์ ได้แก่ Queued → Preparing → Ready โดยไม่ต้องมีสถานะครัวรายรายการอาหาร
- **Verification intent (derived, not a new decision):** อัปเดตสถานะตามทั้งออเดอร์; ไม่สร้าง KDS state ต่อ item เป็นขอบเขตบังคับ
- Current implementation: **PARTIAL**. Evidence: E05. Whole-order PENDING/PREPARING/READY states exist; the approved Queued semantics and separate payment/fulfillment lifecycles remain incomplete.
- Trace: [D08](design.md#d08); [T3.4](tasks.md#t3-4).

### VLP-007 - Scheduled Hours and Manual Pause

- Source / approved decision: [approved register](approved-requirements.md), Scope 07 / **B**.
- **Approved requirement:** ร้านกำหนดเวลาเปิด/ปิดรับออเดอร์อัตโนมัติตามตาราง และกด Pause รับออเดอร์เองได้ ออเดอร์ที่ชำระแล้วต้องยังดำเนินงานต่อ
- **Verification intent (derived, not a new decision):** นอกเวลา/ร้าน Pause ห้ามเริ่มออเดอร์ใหม่; Paid Orders ที่มีอยู่ไม่ถูกยกเลิกด้วยเหตุ Pause
- Current implementation: **PARTIAL**. Evidence: E02, E08. Closing-time settings and accepting_orders exist; scheduled opening hours and safe manual pause across paid work need implementation.
- Trace: [D02](design.md#d02); [T3.1](tasks.md#t3-1), [T4.1](tasks.md#t4-1).

### VLP-008 - Menu Options and Modifiers

- Source / approved decision: [approved register](approved-requirements.md), Scope 08 / **B**.
- **Approved requirement:** ร้านจัดการหมวดหมู่ เมนู ราคา และ Option/Modifier เช่น โปรตีน ความเผ็ด Topping กลุ่มจำเป็น/ไม่จำเป็น ราคาเพิ่ม และสถานะพร้อมขาย โดยไม่ต้องตัดสต๊อกวัตถุดิบระดับส่วนผสม
- **Verification intent (derived, not a new decision):** Checkout ตรวจตัวเลือกที่จำเป็นและค่าบวก; ไม่มี requirement สูตรอาหารหรือ ingredient deduction
- Current implementation: **PARTIAL**. Evidence: E02, E14. Organization menu categories and prices exist; required/optional modifier groups, toppings and price additions are missing. Retain legacy recipes without requiring them.
- Trace: [D03](design.md#d03); [T3.1](tasks.md#t3-1), [T3.7](tasks.md#t3-7).

### VLP-009 - Admin Restaurant Approval

- Source / approved decision: [approved register](approved-requirements.md), Scope 09 / **B**.
- **Approved requirement:** ร้านใหม่ต้องผ่านการตรวจสอบและอนุมัติโดย Platform Admin ก่อนปรากฏเป็นร้านเปิดขาย เจ้าของสามารถเตรียมข้อมูลร้าน/เมนูระหว่างรอได้
- **Verification intent (derived, not a new decision):** ร้าน Pending Approval เตรียมข้อมูลได้ แต่เปิดขายผ่าน Marketplace ไม่ได้
- Current implementation: **MISSING**. Evidence: E02, E16. Setup completion is not an Admin restaurant-approval workflow. No matching platform approval module was found.
- Trace: [D02](design.md#d02); [T3.1](tasks.md#t3-1), [T6.7](tasks.md#t6-7).

### VLP-010 - One Owner Account Manages Multiple Independent Restaurants

- Source / approved decision: [approved register](approved-requirements.md), Scope 10 / **B**.
- **Approved requirement:** เจ้าของบัญชีเดียวดูแลร้านอาหารหลายร้านได้ แต่แต่ละร้านเป็น Entity อิสระ แยกเมนู คิว ออเดอร์ รายรับ การตั้งค่า และสถานะอนุมัติ ไม่มีโครงสร้างหลายสาขาที่ผูกร้านรวมกัน
- **Verification intent (derived, not a new decision):** เจ้าของสลับร้านที่ตนมีสิทธิ์ได้; ข้อมูล/คิว/ชำระเงินแยกตามร้าน
- Current implementation: **PARTIAL**. Evidence: E01, E02, E05. B01 selects one organization per restaurant and permits an Owner to manage separate organizations. Organization-scoped setup is a reuse seam; existing operational queue/orders still use branch context. The approved mapping does not establish restaurant-native operations or approval isolation.
- Trace: [D02](design.md#d02); [T1.1](tasks.md#t1-1), [T2.1](tasks.md#t2-1), [T3.1](tasks.md#t3-1).

### VLP-011 - Hybrid Community Marketplace Directory

- Source / approved decision: [approved register](approved-requirements.md), Scope 11 / **C**.
- **Approved requirement:** หน้า Marketplace แสดงร้านที่เข้าร่วมทั้งหมดและรองรับตัวกรองตามตลาด พื้นที่ หรือชุมชน เช่น กลุ่มร้านรอบมหาวิทยาลัย
- **Verification intent (derived, not a new decision):** หน้า Directory รวมร้านและมี Community/Market filters โดยไม่บังคับลูกค้าเข้าจากตลาดเดียว
- Current implementation: **PARTIAL**. Evidence: E08. Public directory exists; approved market/community registry and directory filters are missing.
- Trace: [D04](design.md#d04); [T6.1](tasks.md#t6-1).

### VLP-012 - Guest Checkout and Optional Member Account

- Source / approved decision: [approved register](approved-requirements.md), Scope 12 / **B**.
- **Approved requirement:** ลูกค้าสั่งอาหารได้โดยไม่สมัครสมาชิก ใช้ Secure Token ติดตามออเดอร์ Guest; สมาชิกเข้าสู่ระบบเพื่อดูประวัติและข้อมูลบัญชีตน
- **Verification intent (derived, not a new decision):** Guest Checkout ทำงานได้; ไม่เปิดข้อมูล Guest Order จากเลขออเดอร์อย่างเดียว
- Current implementation: **PARTIAL**. Evidence: E03, E17. Guest token tracking and identity flows exist; customer-owned member order history and its access path are incomplete.
- Trace: [D05](design.md#d05); [T3.2](tasks.md#t3-2), [T6.4](tasks.md#t6-4).

### VLP-013 - Conditional Cancellation

- Source / approved decision: [approved register](approved-requirements.md), Scope 13 / **B**.
- **Approved requirement:** ลูกค้าขอยกเลิกได้ก่อนสถานะ Preparing และต้องให้ร้านอนุมัติ หลังเริ่ม Preparing ไม่มีการยกเลิกปกติโดยลูกค้า ร้านสามารถยกเลิกหากไม่สามารถให้บริการได้; การคืนเงินต้องเป็น Workflow แยก
- **Verification intent (derived, not a new decision):** คำขอยกเลิกก่อน Preparing ไม่ใช่การยกเลิกโดยอัตโนมัติ; หลัง Preparing ใช้ข้อยกเว้น/ข้อพิพาทตามนโยบาย
- Current implementation: **PARTIAL**. Evidence: E07. Owner transitions allow cancellation, including during preparation. The distinct customer request-before-Preparing and merchant approval workflow is missing. Merchant exception cancellation remains allowed.
- Trace: [D09](design.md#d09); [T3.6](tasks.md#t3-6).

### VLP-014 - Manual Food Refund by Merchant

- Source / approved decision: [approved register](approved-requirements.md), Scope 14 / **A**.
- **Approved requirement:** หากคืนเงินค่าอาหาร ร้านเป็นผู้โอนเงินคืนลูกค้าโดยตรงและบันทึกสถานะ/หลักฐาน VELOPOS ไม่ดึงเงินออกจากร้านหรือคืนเงินค่าอาหารแทนร้าน
- **Verification intent (derived, not a new decision):** Refund record อ้างอิงออเดอร์; ไม่มีการเบิกจ่ายอาหารจาก platform treasury
- Current implementation: **CONFLICTING**. Evidence: E07. Existing customer refund code invokes a provider refund gateway. It cannot stand in for the approved merchant-direct manual food refund workflow. Preserve it only for compatible legacy records.
- Trace: [D09](design.md#d09); [T3.6](tasks.md#t3-6).

### VLP-015 - Delivery Radius and Flat Fee

- Source / approved decision: [approved register](approved-requirements.md), Scope 15 / **A**.
- **Approved requirement:** ร้านกำหนดรัศมีพื้นที่จัดส่งและค่าจัดส่งแบบคงที่ต่อออเดอร์ โดยตรวจสอบตำแหน่งจัดส่งก่อนเริ่มชำระเงิน
- **Verification intent (derived, not a new decision):** ที่อยู่นอกระยะถูกปฏิเสธก่อน Checkout; ค่าส่งมาจากตั้งค่าร้าน
- Current implementation: **PARTIAL**. Evidence: E04. Flat shipping fee and delivery address exist; no delivery_radius/radius_km evidence or pre-payment geographic validation was found.
- Trace: [D09](design.md#d09); [T3.5](tasks.md#t3-5).

### VLP-016 - Manual Delivery Status and ETA

- Source / approved decision: [approved register](approved-requirements.md), Scope 16 / **B**.
- **Approved requirement:** การจัดส่งโดยร้านมีสถานะการจัดส่งและเวลาคาดการณ์ที่เจ้าของร้านอัปเดตได้ ไม่มี GPS ติดตามไรเดอร์แบบเรียลไทม์
- **Verification intent (derived, not a new decision):** ลูกค้าเห็นสถานะ/ETA ที่ร้านอัปเดต; ไม่บังคับ GPS Tracking
- Current implementation: **MISSING**. Evidence: E04, E16. Delivery order fields exist, but no separate delivery-status/owner-updated ETA workflow was found.
- Trace: [D09](design.md#d09); [T3.5](tasks.md#t3-5).

### VLP-017 - Real-Time Web and Optional Browser Push

- Source / approved decision: [approved register](approved-requirements.md), Scope 17 / **B**.
- **Approved requirement:** ออเดอร์/คิว/สถานะแจ้งเตือนผ่านเว็บไซต์แบบ Real-Time และ Browser Push เมื่อได้รับอนุญาต มีเสียงหรือการแจ้งเตือนใน Dashboard ร้าน ไม่มี LINE Notification
- **Verification intent (derived, not a new decision):** สถานะอัปเดตบนเว็บได้แม้ปิด Push; ไม่ต้องมี LINE Integration
- Current implementation: **PARTIAL**. Evidence: E09. Tracking and kitchen views poll; permission-aware browser push and restaurant notification/sound acceptance are not established.
- Trace: [D11](design.md#d11); [T6.6](tasks.md#t6-6).

### VLP-018 - Persistent Table QR and Sessions

- Source / approved decision: [approved register](approved-requirements.md), Scope 18 / **B**.
- **Approved requirement:** โต๊ะมี QR แบบคงที่ที่ผูกหมายเลขโต๊ะกับร้าน เมื่อลูกค้าสแกนจะดูเมนูและเลือกโหมด Dine-in/Takeaway ตาม Flow ที่กำหนด รองรับหลายออเดอร์ชำระเงินแยกกันบนโต๊ะเดียวและจัดคิว FIFO ตามแต่ละออเดอร์ ต้องป้องกันข้อมูลลูกค้า/เซสชันเดิมรั่วไหล
- **Verification intent (derived, not a new decision):** QR ระบุโต๊ะถูกต้อง; สร้างหลายออเดอร์แยก payment/queue ได้; session ใหม่ไม่เห็นข้อมูลเดิมที่ไม่เกี่ยวข้อง
- Current implementation: **PARTIAL**. Evidence: E04. Table tokens and dine-in tests exist. Independent table orders, private session turnover and the full approved mode flow need acceptance.
- Trace: [D02](design.md#d02); [T3.1](tasks.md#t3-1), [T3.2](tasks.md#t3-2).

### VLP-019 - Advanced Restaurant Analytics

- Source / approved decision: [approved register](approved-requirements.md), Scope 19 / **C**.
- **Approved requirement:** ร้านมี Dashboard และรายงานยอดขาย ตัวกรองช่วงเวลา สินค้าขายดี การยกเลิก Refund ช่วงเวลายุ่ง ลูกค้าซื้อซ้ำเมื่อมีข้อมูลยืนยันตัวตน ประสิทธิภาพคิว และแนวโน้ม รองรับส่งออก CSV/Excel; ไม่อ้างว่าคำนวณกำไรสุทธิหากไม่มีต้นทุนสินค้า
- **Verification intent (derived, not a new decision):** แสดงสถิติจากข้อมูลธุรกรรมที่ตรวจสอบได้และแยกร้าน; CSV/Excel Export; ไม่มี Net Profit จากข้อมูลที่ไม่มี COGS
- Current implementation: **PARTIAL**. Evidence: E12, E16. Sales/receipt records provide inputs, not the approved advanced analytics and CSV/Excel reporting. No net-profit claim is supported.
- Trace: [D14](design.md#d14); [T6.10](tasks.md#t6-10).

### VLP-020 - Advanced Platform Admin Operations

- Source / approved decision: [approved register](approved-requirements.md), Scope 20 / **C**.
- **Approved requirement:** Platform Admin จัดการผู้ใช้ ตรวจอนุมัติร้าน ตลาด/ชุมชน ข้อพิพาท ความเสี่ยง/การทุจริต Audit และกำกับโฆษณา/การโปรโมตได้
- **Verification intent (derived, not a new decision):** ผู้ดูแลมีสิทธิ์ตามบทบาทและ Audit Trail; ไม่เข้าถึงธุรกรรมร้านอื่นโดยไม่มีสิทธิ์
- Current implementation: **MISSING**. Evidence: E16. No platform-admin operations module covering restaurant approval, markets, disputes, fraud and ads was found.
- Trace: [D12](design.md#d12); [T6.7](tasks.md#t6-7).

### VLP-021 - Advanced Sponsored Ads Platform

- Source / approved decision: [approved register](approved-requirements.md), Scope 21 / **C**.
- **Approved requirement:** ร้านซื้อแคมเปญโปรโมตได้ กำหนดงบ ระยะเวลา การกำหนดกลุ่ม/พื้นที่ ตำแหน่งแสดงโฆษณา วัด Impression/Click/Conversion และต้องผ่าน Admin Review มีป้าย Sponsored ชัดเจน รายได้โฆษณาจ่ายให้ VELOPOS แยกจากเงินอาหาร
- **Verification intent (derived, not a new decision):** แคมเปญต้องผ่านการอนุมัติ; โฆษณาเห็น Sponsored; วอลเล็ตโฆษณาไม่ใช่เงินอาหาร
- Current implementation: **MISSING**. Evidence: E16. No reviewed sponsored campaign, budget, targeting or measurement implementation was found.
- Trace: [D13](design.md#d13); [T6.9](tasks.md#t6-9).

### VLP-022 - AI Customer Shopping Assistant

- Source / approved decision: [approved register](approved-requirements.md), Scope 22 / **C**.
- **Approved requirement:** AI Chat Assistant ช่วยค้นหา/เปรียบเทียบ/แนะนำร้านและเมนูจากข้อมูลจริง เช่น ราคา คิว ความพร้อมขาย ช่วยเลือก Modifier และเพิ่มลงตะกร้าร้านเดียวได้ แต่ลูกค้าต้องยืนยันและชำระเงินเอง ต้องระบุ Sponsored ที่เกี่ยวข้องอย่างโปร่งใส
- **Verification intent (derived, not a new decision):** AI ไม่สร้างคำสั่งซื้อ/ชำระเอง; ไม่เสนอเมนูที่ไม่มีจริงหรือแฝงโฆษณาเป็น Organic
- Current implementation: **CONFLICTING**. Evidence: E10. VeloAssistantChat uses keyword replies, seeded messages and a fallback restaurant. Internal FastAPI exposes health endpoints only; this is not the approved real-data AI assistant.
- Trace: [D15](design.md#d15); [T6.2](tasks.md#t6-2).

### VLP-023 - No LINE Integration

- Source / approved decision: [approved register](approved-requirements.md), Scope 23 / **D**.
- **Approved requirement:** ไม่รวม LINE Ordering, LIFF, LINE Chat หรือ LINE Notification ในขอบเขต VELOPOS ที่อนุมัติ
- **Verification intent (derived, not a new decision):** การสั่งอาหารและแจ้งเตือนทำงานผ่านช่องทางแพลตฟอร์มเอง ไม่พึ่ง LINE
- Current implementation: **IMPLEMENTED**. Evidence: E16. Static exclusion only: no LINE/LIFF integration identifiers or LINE hosts were found in the bounded runtime/contract/schema scan. No live integration test is claimed.
- Trace: [D11](design.md#d11); [T6.6](tasks.md#t6-6).

### VLP-024 - Verified Order Reviews

- Source / approved decision: [approved register](approved-requirements.md), Scope 24 / **B**.
- **Approved requirement:** ลูกค้ารีวิวร้านด้วยคะแนน 1–5 ดาวและข้อความได้เฉพาะออเดอร์ที่ Completed จริง รองรับสมาชิกและ Guest ผ่าน Token ปลอดภัย จำกัดหนึ่งรีวิวต่อออเดอร์ โดยไม่กำหนดรูปภาพรีวิวหรือการตอบกลับของร้านเป็นข้อบังคับ
- **Verification intent (derived, not a new decision):** ไม่เปิดรีวิวออเดอร์ Pending/No-Show; ออเดอร์เดียวรีวิวได้ครั้งเดียว
- Current implementation: **MISSING**. Evidence: E16. No verified-completion, single-review-per-order review model or endpoint was found.
- Trace: [D04](design.md#d04); [T6.12](tasks.md#t6-12).

### VLP-025 - Customer Profile and Favorites

- Source / approved decision: [approved register](approved-requirements.md), Scope 25 / **B**.
- **Approved requirement:** สมาชิกมีโปรไฟล์ ประวัติออเดอร์ ที่อยู่ รายการร้าน/เมนูโปรด และ Reorder โดยตรวจสอบราคา/สถานะเมนูใหม่; ไม่ยกเลิก Guest Checkout
- **Verification intent (derived, not a new decision):** สมาชิกจัดการข้อมูลตนและ Favorites ได้; Reorder ไม่ใช้ราคาเก่าโดยอัตโนมัติ
- Current implementation: **PARTIAL**. Evidence: E03, E17. Device-local menu favorites exist; member profiles, addresses, account-bound favorites/history and safe reorder remain incomplete.
- Trace: [D10](design.md#d10); [T6.4](tasks.md#t6-4).

### VLP-026 - Advanced Marketplace Search and Geo Filters

- Source / approved decision: [approved register](approved-requirements.md), Scope 26 / **B**.
- **Approved requirement:** ค้นหาด้วยข้อความ หมวดหมู่ ตลาด/ชุมชน ตำแหน่งที่ผู้ใช้ยินยอม ระยะทาง ราคา รีวิว สถานะเปิดร้าน Delivery และความหนาแน่น/คิว โดยไม่บังคับมีหน้าสำรวจแผนที่เต็มรูปแบบ
- **Verification intent (derived, not a new decision):** ไม่ใช้พิกัดหากไม่มีสิทธิ์; ผลค้นหาคำนึงถึงพื้นที่และ Filter; ไม่มี Map Explorer เป็นข้อบังคับ
- Current implementation: **PARTIAL**. Evidence: E08. Catalog text/category/price/availability filtering exists. Community, consented geo, distance, review and queue-aware marketplace filters are missing.
- Trace: [D04](design.md#d04); [T6.1](tasks.md#t6-1).

### VLP-027 - Controlled Storefront Customization

- Source / approved decision: [approved register](approved-requirements.md), Scope 27 / **B**.
- **Approved requirement:** ร้านปรับรูปแบบหน้าร้านในขอบเขต Design System กลาง เช่น สีที่อนุญาต แบนเนอร์ แกลเลอรี เมนูแนะนำ และลำดับ Section โดยไม่สร้างธีมอิสระไร้ข้อจำกัด
- **Verification intent (derived, not a new decision):** แต่ละร้านปรับข้อมูลการนำเสนอได้โดยไม่ทำลาย UX/Accessibility กลาง
- Current implementation: **PARTIAL**. Evidence: E02, E13. Storefront settings and shared visual tokens exist; owner-controlled approved colors, gallery/banner and section configuration are not established. This does not approve Scope 93 media management.
- Trace: [D04](design.md#d04); [T6.1](tasks.md#t6-1).

### VLP-028 - Dynamic Wait ETA

- Source / approved decision: [approved register](approved-requirements.md), Scope 28 / **B**.
- **Approved requirement:** คำนวณและแสดงเวลารอคาดการณ์จากคิว FIFO ปริมาณงานและประวัติ แสดงก่อนและหลังการสั่ง โดยยังไม่มีระบบ Auto-Close รับออเดอร์เมื่อคิวเต็ม
- **Verification intent (derived, not a new decision):** ETA เปลี่ยนตามภาระงาน; ไม่ปิดรับตามเกณฑ์คิวอัตโนมัติ
- Current implementation: **MISSING**. Evidence: E05, E16. No dynamic wait ETA methodology or historical-workload implementation was found.
- Trace: [D08](design.md#d08); [T3.4](tasks.md#t3-4).

### VLP-029 - ASAP Orders Only

- Source / approved decision: [approved register](approved-requirements.md), Scope 29 / **A**.
- **Approved requirement:** รองรับการสั่งล่วงหน้าเพื่อรับเมื่ออาหารพร้อม แต่ไม่กำหนดเวลารับในอนาคตแบบ Scheduled Pickup
- **Verification intent (derived, not a new decision):** Checkout ไม่มีการจองช่วงเวลารับล่วงหน้าเป็นข้อบังคับ
- Current implementation: **PARTIAL**. Evidence: E03, E16. Current order inputs have no scheduled pickup time. ASAP ordering is a reuse seam; the complete approved path still requires payment and fulfillment acceptance.
- Trace: [D06](design.md#d06); [T3.2](tasks.md#t3-2).

### VLP-030 - Verified Handover by Channel

- Source / approved decision: [approved register](approved-requirements.md), Scope 30 / **B**.
- **Approved requirement:** ยืนยันการส่งมอบตามช่องทาง: Dine-in ยืนยันอาหารถึงโต๊ะ, Takeaway/Pickup ใช้ QR/รหัสเฉพาะออเดอร์, Delivery ใช้รหัสยืนยันจากลูกค้า บันทึกหลักฐานและเวลาการส่งมอบ
- **Verification intent (derived, not a new decision):** การส่งมอบผูก Order/Channel ถูกต้องและป้องกันการยืนยันซ้ำ
- Current implementation: **MISSING**. Evidence: E04, E16. No channel-specific verified handover evidence, order code or customer delivery-code workflow was found.
- Trace: [D09](design.md#d09); [T3.5](tasks.md#t3-5).

### VLP-031 - Single Owner per Restaurant; No Staff Module

- Source / approved decision: [approved register](approved-requirements.md), Scope 31 / **A**.
- **Approved requirement:** ร้านหนึ่งมีบัญชี Owner ได้เพียงหนึ่งบัญชี เจ้าของดูแลหลายร้านแยกกันได้ ไม่มีโมดูลพนักงานหรือบทบาท Co-owner ในขอบเขตปัจจุบัน
- **Verification intent (derived, not a new decision):** สิทธิ์ Owner ร้านเดียวพร้อมกันหนึ่งบัญชี; ไม่มี Staff CRUD/RBAC เป็นฟีเจอร์ที่อนุมัติ
- Current implementation: **PARTIAL**. Evidence: E01, E02. Current permission policy grants management capabilities to OWNER only. Single-owner transfer/recovery and elimination of new staff/co-owner product flows remain gaps; preserve legacy records.
- Trace: [D05](design.md#d05); [T1.3](tasks.md#t1-3), [T3.8](tasks.md#t3-8).

### VLP-032 - Global and Sales-Mode Pause

- Source / approved decision: [approved register](approved-requirements.md), Scope 32 / **B**.
- **Approved requirement:** ร้านควบคุม Pause ทั้งร้านหรือแยกตาม Dine-in, Takeaway, Pickup และ Delivery ได้ร่วมกับตารางเวลาเปิดร้าน ออเดอร์ที่ Paid แล้วต้องทำต่อ
- **Verification intent (derived, not a new decision):** Pause เฉพาะช่องทางไม่ปิดช่องทางอื่น; คิว Paid ไม่ถูกลบ
- Current implementation: **PARTIAL**. Evidence: E02, E08, [T3.1](tasks.md#t3-1) and [T4.1](tasks.md#t4-1). Global `accepting_orders` and four setup-mode flags exist. The setup UI exposes Pickup separately from Takeaway for an existing organization without a branch. This value does not change public admission. Per-mode pause and its interaction with paid work remain open.
- Trace: [D02](design.md#d02); [T3.1](tasks.md#t3-1).

### VLP-033 - Admin Community/Market/Category Registry

- Source / approved decision: [approved register](approved-requirements.md), Scope 33 / **B**.
- **Approved requirement:** Platform Admin ดูแลทะเบียนตลาด ชุมชน และหมวดหมู่กลาง ร้านส่งคำขอเพิ่มรายการใหม่ได้แต่ต้องรอ Admin ตรวจสอบก่อนนำมาใช้
- **Verification intent (derived, not a new decision):** ค่ากลางสร้างโดย Admin; คำขอใหม่ร้านไม่เผยแพร่ทันที
- Current implementation: **MISSING**. Evidence: E16. No Admin market/community/category request-and-approval registry was found. Existing tenant categories are not this central registry.
- Trace: [D04](design.md#d04); [T6.1](tasks.md#t6-1).

### VLP-034 - One Real Restaurant Location and Primary Market

- Source / approved decision: [approved register](approved-requirements.md), Scope 34 / **B**.
- **Approved requirement:** ร้านหนึ่งมีสถานที่จริงแห่งเดียวและตลาดหลักหนึ่งแห่ง แต่ขอให้แสดงในหลายชุมชนหรือพื้นที่ค้นพบได้หาก Admin อนุมัติ ห้ามสร้างที่ตั้งปลอมหรือคิว/ร้านซ้ำ และระยะจัดส่งใช้พิกัดจริงของร้าน
- **Verification intent (derived, not a new decision):** ร้านหนึ่งมีพิกัดจริงหนึ่งแห่ง; แสดงหลาย Community ไม่สร้าง Order/Queue ซ้ำ
- Current implementation: **PARTIAL**. Evidence: E02, E16. Restaurant location setup exists; primary-market and approved multi-community discovery mappings are missing.
- Trace: [D02](design.md#d02); [T3.1](tasks.md#t3-1), [T6.1](tasks.md#t6-1).

### VLP-035 - Free/Pro Subscription plus Separate Ads Revenue

- Source / approved decision: [approved register](approved-requirements.md), Scope 35 / **B**.
- **Approved requirement:** โมเดลธุรกิจ VELOPOS ไม่มีค่าธรรมเนียมต่อออเดอร์ค่าอาหาร ร้านใช้ Free หรือ Pro Subscription และซื้อโฆษณาเพิ่มได้ โดยรายได้โฆษณา/Pro จ่ายให้แพลตฟอร์มแยกจากเงินอาหาร
- **Verification intent (derived, not a new decision):** ไม่หักเปอร์เซ็นต์อาหารโดยแพลตฟอร์ม; Billing รายได้แพลตฟอร์มแยกจาก Food Payment
- Current implementation: **MISSING**. Evidence: E16. No Free/Pro entitlement or separate ads/platform revenue implementation was found. Food commission is excluded by the approved register.
- Trace: [D13](design.md#d13); [T6.8](tasks.md#t6-8).

### VLP-036 - Hybrid Pro/Ads Billing

- Source / approved decision: [approved register](approved-requirements.md), Scope 36 / **C**.
- **Approved requirement:** การชำระค่า Pro และโฆษณาของแพลตฟอร์มใช้การยืนยัน PromptPay ผ่าน Provider เป็นหลัก พร้อมทางเลือกให้ Admin ตรวจสอบการชำระด้วยตนเองกรณีจำเป็น มีประวัติรายการและ Admin อนุมัติแคมเปญหลังจ่าย
- **Verification intent (derived, not a new decision):** ไม่เปิด Ads ก่อนเงื่อนไขจ่าย/อนุมัติครบ; Manual fallback ต้องมี Audit
- Current implementation: **MISSING**. Evidence: E06, E16. Customer test-payment code does not implement separate Pro/ads billing or audited Admin manual fallback.
- Trace: [D13](design.md#d13); [T6.8](tasks.md#t6-8).

### VLP-037 - Feature-Based Free and Pro Plans

- Source / approved decision: [approved register](approved-requirements.md), Scope 37 / **A**.
- **Approved requirement:** Free มีฟีเจอร์หลักของร้านครบ เช่น เมนู ออเดอร์ QR โต๊ะ FIFO ครัว รับชำระ Pickup/Delivery และ Dashboard พื้นฐาน ส่วน Pro เน้น Analytics/Reports ขั้นสูงและ Storefront ขั้นสูง ทั้งสองแผนซื้อ Ads เพิ่มได้ รายการสิทธิ์ย่อยละเอียดจะกำหนดภายหลัง
- **Verification intent (derived, not a new decision):** Free ต้องยังขายอาหารได้ครบ; ไม่ทำให้ Payment/FIFO เป็น Pro-only
- Current implementation: **MISSING**. Evidence: E16. No Free/Pro feature matrix or entitlement checks were found. The matrix details remain TBD; core selling must remain Free.
- Trace: [D13](design.md#d13); [T6.8](tasks.md#t6-8).

### VLP-038 - Monthly/Yearly Pro with Manual Renewal

- Source / approved decision: [approved register](approved-requirements.md), Scope 38 / **B**.
- **Approved requirement:** Pro สมัครเป็นรอบเดือนหรือปี ต่ออายุด้วยการชำระแบบ Manual Renewal ไม่ตัดเงินอัตโนมัติ แจ้งก่อนหมดอายุ และลดระดับเป็น Free โดยรักษาข้อมูลร้านเดิม; ราคาและรอบแจ้งเตือนยังไม่กำหนด
- **Verification intent (derived, not a new decision):** เมื่อ Pro หมดอายุไม่ลบข้อมูล; ไม่มี Auto Charge
- Current implementation: **MISSING**. Evidence: E16. No monthly/yearly manual-renewal, expiry notice and data-preserving downgrade workflow was found. Prices and timing remain TBD.
- Trace: [D13](design.md#d13); [T6.8](tasks.md#t6-8).

### VLP-039 - Hybrid Fixed-Price and CPC/CPM Advertising

- Source / approved decision: [approved register](approved-requirements.md), Scope 39 / **C**.
- **Approved requirement:** โฆษณารองรับทั้งแบบราคาคงที่และ CPC/CPM พร้อม Budget/Duration/Tracking ภายใต้การตรวจสอบของ Admin กฎอัตราและการหักเงินละเอียดต้องออกแบบเพิ่มเติม
- **Verification intent (derived, not a new decision):** แคมเปญใช้ Pricing Model ที่กำหนด; ค่าใช้จ่ายต้องตรวจสอบได้และไม่เกินงบ
- Current implementation: **MISSING**. Evidence: E16. No fixed-price/CPC/CPM campaign rating and budget enforcement was found; rates and charging rules remain TBD.
- Trace: [D13](design.md#d13); [T6.9](tasks.md#t6-9).

### VLP-040 - Clearly Labeled Sponsored Placement

- Source / approved decision: [approved register](approved-requirements.md), Scope 40 / **B**.
- **Approved requirement:** แสดง Sponsored ได้บน Homepage, หน้า Market/Community และพื้นที่ Search ตามความเกี่ยวข้อง พื้นที่ สถานะร้าน และความพร้อมขาย ต้องติดป้ายชัดเจน ไม่เปลี่ยนอันดับผล Organic แบบแอบแฝงหรือแฝงใน AI Recommendation
- **Verification intent (derived, not a new decision):** Organic Ranking ไม่ถูกซื้ออันดับอย่างไม่เปิดเผย; Sponsored มี Label เสมอ
- Current implementation: **MISSING**. Evidence: E16. No approved sponsored placement or organic-ranking separation implementation was found.
- Trace: [D13](design.md#d13); [T6.9](tasks.md#t6-9).

### VLP-041 - Prepaid Advertising Wallet and Immutable Ledger

- Source / approved decision: [approved register](approved-requirements.md), Scope 41 / **B**.
- **Approved requirement:** ร้านเติมเครดิตโฆษณาล่วงหน้า แยกยอดใช้งานได้และยอดจองตามแคมเปญ หักใช้จ่ายแบบ Atomic คืนยอดจองที่ไม่ได้ใช้ได้ และบันทึก Wallet Ledger แบบตรวจสอบย้อนหลังได้ แยกจากเงินอาหาร
- **Verification intent (derived, not a new decision):** ห้ามใช้เครดิตเกินยอดคงเหลือ; ไม่มี Double Spend; ห้ามหักอาหารจาก Ad Wallet
- Current implementation: **MISSING**. Evidence: E16. No separate prepaid advertising wallet, reservation or immutable spend ledger was found.
- Trace: [D13](design.md#d13); [T6.9](tasks.md#t6-9).

### VLP-042 - Ad Conversion Attribution and ROAS Reporting

- Source / approved decision: [approved register](approved-requirements.md), Scope 42 / **B**.
- **Approved requirement:** รายงาน Impression, Click, CTR, Attributed Paid Orders, Attributed Revenue, Conversion และ ROAS โดยคำนึงถึงสิทธิ์ความเป็นส่วนตัว และปรับตัวเลข Attribution เมื่อเกิด Refund; ไม่รวม Cross-Device Attribution ขั้นสูง
- **Verification intent (derived, not a new decision):** Conversion ต้องเชื่อมออเดอร์ที่จ่ายจริงและไม่ Double Count; Refund ปรับรายงาน
- Current implementation: **MISSING**. Evidence: E16. No paid-order attribution, refund-adjusted conversion or ROAS implementation was found.
- Trace: [D13](design.md#d13); [T6.9](tasks.md#t6-9).

### VLP-043 - Refund Unused Advertising Wallet Credits

- Source / approved decision: [approved register](approved-requirements.md), Scope 43 / **B**.
- **Approved requirement:** ร้านขอคืนเครดิตโฆษณาที่ไม่ใช้ได้ ระบบล็อกยอดที่ขอคืนระหว่างตรวจสอบ Admin ตรวจสอบและดำเนินการโอนเงินคืนด้วยตนเองพร้อมหลักฐาน/Audit แยกจาก Food Refund
- **Verification intent (derived, not a new decision):** ไม่สามารถใช้ยอดที่ล็อกซ้ำ; สถานะคืนเครดิตเชื่อม Ledger และผู้ดำเนินการ
- Current implementation: **MISSING**. Evidence: E16. No locked unused-credit refund request and Admin manual-transfer ledger workflow was found.
- Trace: [D13](design.md#d13); [T6.9](tasks.md#t6-9).

### VLP-044 - Support Tickets and Dispute Workflow

- Source / approved decision: [approved register](approved-requirements.md), Scope 44 / **B**.
- **Approved requirement:** ลูกค้าและร้านสร้าง Support Ticket แยกประเภทเชื่อม Order/Restaurant แนบหลักฐาน โต้ตอบข้อความ และติดตามสถานะได้ Admin ตรวจสอบพร้อม Audit; Guest ใช้สิทธิ์เข้าถึงอย่างปลอดภัย แพลตฟอร์มไม่สามารถดึงเงินค่าอาหารจากร้านได้เอง
- **Verification intent (derived, not a new decision):** Tickets ผูกเจ้าของสิทธิ์และหลักฐาน; Admin ทำ Case Review ไม่ถือเงินอาหาร
- Current implementation: **MISSING**. Evidence: E16. No order/restaurant support ticket, evidence attachment, guest access and dispute workflow was found.
- Trace: [D12](design.md#d12); [T6.7](tasks.md#t6-7).

### VLP-045 - Rule-Based Fraud Detection with Security Controls

- Source / approved decision: [approved register](approved-requirements.md), Scope 45 / **B**.
- **Approved requirement:** ใช้การตรวจจับความผิดปกติตามกฎสำหรับการจ่ายเงิน ออเดอร์ โฆษณา Wallet และการเข้าถึง พร้อม Admin Alerts; รักษา Authentication/RBAC/Tenant Isolation, Rate Limiting, Callback Verification, Atomic Ledger และ Audit ไม่ต้องมี ML Fraud Engine
- **Verification intent (derived, not a new decision):** กฎตรวจจับเหตุผิดปกติได้; ไม่มีการข้าม Provider Verification หรือ RBAC
- Current implementation: **PARTIAL**. Evidence: E01, E06, E16. Authentication, scoped authorization, rate limiting and provider verification seams exist. Cross-domain fraud rules and Admin alerts are missing.
- Trace: [D12](design.md#d12); [T6.7](tasks.md#t6-7).

### VLP-046 - Privacy Data Lifecycle Management

- Source / approved decision: [approved register](approved-requirements.md), Scope 46 / **B**.
- **Approved requirement:** กำหนดตารางเก็บข้อมูลตามประเภท จัดการคำขอเข้าถึง/แก้ไข/ลบข้อมูล ลบหรือทำข้อมูลไม่ระบุตัวตนตามเงื่อนไข และเก็บหลักฐาน Payment/Transactions/Disputes ที่จำเป็นตามกฎหมายและนโยบาย ระยะเวลาจริงยังต้องกำหนด
- **Verification intent (derived, not a new decision):** สิทธิ์ลบไม่ทำลายหลักฐานที่ต้องเก็บ; มี Data Retention Schedule ที่ตรวจสอบได้
- Current implementation: **MISSING**. Evidence: E16. No complete retention schedule and access/correction/deletion request workflow was found. Required retention values remain TBD.
- Trace: [D05](design.md#d05); [T6.7](tasks.md#t6-7).

### VLP-047 - PITR Backup and Disaster Recovery

- Source / approved decision: [approved register](approved-requirements.md), Scope 47 / **B**.
- **Approved requirement:** สำรองฐานข้อมูลและระบบอย่างปลอดภัยแบบเข้ารหัส แยกที่เก็บ รองรับ Point-in-Time Recovery ทดสอบการกู้คืน และตรวจสอบความสอดคล้องของ Orders, Payments, FIFO และ Wallet หลัง Restore; RPO/RTO ยังไม่กำหนด ไม่มีการบังคับทำ Automatic HA Failover
- **Verification intent (derived, not a new decision):** มี Restore Drill/Recovery Validation; Reconcile ธุรกรรมหลัง Restore
- Current implementation: **MISSING**. Evidence: E15. Current container/gateway/CI files do not establish encrypted separate-store PITR or a restore/reconciliation drill. No backup service was contacted.
- Trace: [D16](design.md#d16); [T6.3](tasks.md#t6-3).

### VLP-048 - Full Observability

- Source / approved decision: [approved register](approved-requirements.md), Scope 48 / **B**.
- **Approved requirement:** เก็บ Centralized Logs, Metrics, Distributed Tracing, Dashboards และ Alerts สำหรับ Payment, Orders, Queue, Wallet, Backup และ API โดยปกป้อง PII และ Secrets
- **Verification intent (derived, not a new decision):** เหตุผิดปกติสำคัญมี Monitoring/Alert; ไม่มี Secret/PII อันตรายใน Logs
- Current implementation: **PARTIAL**. Evidence: E15. Structured request logging exists. Centralized metrics, tracing, dashboards and cross-domain alert acceptance are not established.
- Trace: [D16](design.md#d16); [T6.3](tasks.md#t6-3).

### VLP-049 - Controlled CI/CD Rolling Release

- Source / approved decision: [approved register](approved-requirements.md), Scope 49 / **B**.
- **Approved requirement:** Pipeline ทำ Automated Tests, Security Checks และ Staging Validation ก่อนปล่อย Production ด้วย Manual Approval รองรับ Rolling Deployment, Health Check/Rollback ของแอป, Backward-Compatible Database Migrations, Idempotency และ Reconciliation
- **Verification intent (derived, not a new decision):** ไม่มี Auto Production Deploy โดยไร้อนุมัติ; Migration ปลอดภัยย้อนหลังและ rollback plan
- Current implementation: **PARTIAL**. Evidence: E15. CI defines checks. Staging validation, approved production rolling release and verified rollback are not established by the inspected workflows.
- Trace: [D16](design.md#d16); [T6.3](tasks.md#t6-3).

### VLP-050 - Multi-Community Scaling and Load Validation

- Source / approved decision: [approved register](approved-requirements.md), Scope 50 / **B**.
- **Approved requirement:** ออกแบบเพื่อขยายจำนวนร้าน/ชุมชนด้วย Horizontal Scaling, Cache, Workers และ Database Optimization พร้อม Load/Stress Testing เป้าหมายออกแบบเบื้องต้นราว 1,000 ร้าน, 5,000 Concurrent Users และ 10,000 Orders/Day ยังไม่ใช่ผลทดสอบหรือรับประกัน
- **Verification intent (derived, not a new decision):** มีแผนทดสอบและ Capacity Metrics; ไม่อ้างผ่านเป้าหมายก่อนทดสอบจริง
- Current implementation: **PARTIAL**. Evidence: E15. Current database/API and test seams exist; no current load result proves the stated design targets or scaling SLOs.
- Trace: [D16](design.md#d16); [T6.3](tasks.md#t6-3).

### VLP-051 - Controlled Partner Read API and Webhooks

- Source / approved decision: [approved register](approved-requirements.md), Scope 51 / **B**.
- **Approved requirement:** พาร์ตเนอร์ที่ได้รับอนุมัติสามารถอ่านข้อมูลร้าน เมนู และสถานะออเดอร์เท่าที่ได้รับสิทธิ์ ผ่าน API/Webhooks พร้อม Credentials, Scopes, Rate Limits และ Audit ไม่เปิดให้บุคคลภายนอกสร้างออเดอร์ผ่าน API และไม่มี LINE
- **Verification intent (derived, not a new decision):** Partner credential แยกสิทธิ์; ไม่อนุญาต Write Order จาก External Partner
- Current implementation: **MISSING**. Evidence: E16. Public storefront routes are not scoped partner credentials/read APIs or outbound signed webhooks. No partner authority to create orders is approved.
- Trace: [D14](design.md#d14); [T6.10](tasks.md#t6-10).

### VLP-052 - Thai/English Bilingual Platform

- Source / approved decision: [approved register](approved-requirements.md), Scope 52 / **B**.
- **Approved requirement:** รองรับภาษาไทยและอังกฤษทั่วระบบ ร้านกรอกชื่อ/รายละเอียดเมนูสองภาษาได้ ถ้าไม่มีภาษาอังกฤษให้ใช้ภาษาไทยเป็น Fallback ใช้ THB เท่านั้น ไม่บังคับ AI Auto-Translation
- **Verification intent (derived, not a new decision):** Language Switch ทำงานทุกหน้าหลัก; ข้อมูลไม่มี EN แสดง Thai Fallback
- Current implementation: **PARTIAL**. Evidence: E13. Thai/English UI message modules and THB quoting exist; two-language merchant menu fields and whole-platform fallback acceptance remain gaps.
- Trace: [D16](design.md#d16); [T6.11](tasks.md#t6-11).

### VLP-053 - Responsive plus WCAG 2.2 AA Target

- Source / approved decision: [approved register](approved-requirements.md), Scope 53 / **B**.
- **Approved requirement:** ออกแบบ Customer, Restaurant และ Admin ให้รองรับ Mobile/Tablet/Desktop และตั้งเป้า Accessibility WCAG 2.2 AA เช่น Keyboard, Screen Reader, Focus, Contrast, Form Validation พร้อมทดสอบ ไม่อ้างการรับรองโดยไม่มีผลตรวจ
- **Verification intent (derived, not a new decision):** ฟังก์ชันหลักใช้งานด้วย Keyboard และ Screen Reader ได้ตามเกณฑ์ที่ทดสอบ
- Current implementation: **PARTIAL**. Evidence: E13. Responsive components and browser-test seams exist. No fresh mobile/tablet/desktop or WCAG 2.2 AA acceptance was run in this documentation task.
- Trace: [D16](design.md#d16); [T5.3](tasks.md#t5-3), [T6.11](tasks.md#t6-11).

### VLP-054 - Installable PWA and Offline Read-Only Cache

- Source / approved decision: [approved register](approved-requirements.md), Scope 54 / **B**.
- **Approved requirement:** รองรับการติดตั้งเป็น PWA และอ่านข้อมูลสาธารณะที่ Cache ไว้เมื่อ Offline อย่างจำกัด แต่การสร้างออเดอร์ จ่ายเงิน และเปลี่ยนสถานะคิวต้อง Online และ Server Revalidation; ทำ Cache Cleanup เมื่อ Logout
- **Verification intent (derived, not a new decision):** Offline ไม่กดชำระ/สั่งจริงสำเร็จ; ไม่ Cache ข้อมูลส่วนตัวผิดสิทธิ์
- Current implementation: **MISSING**. Evidence: E16. No service-worker/PWA registration evidence was found. Offline public-only reads and logout cache cleanup remain unimplemented in this audit.
- Trace: [D16](design.md#d16); [T6.11](tasks.md#t6-11).

### VLP-055 - Browser/PDF Printing

- Source / approved decision: [approved register](approved-requirements.md), Scope 55 / **B**.
- **Approved requirement:** พิมพ์รายการรับออเดอร์ Kitchen Ticket และใบรับเงิน/ใบเสร็จด้วย Browser Print หรือ PDF ไม่มี Direct Thermal Printer Integration หรือ Auto Print ใน Scope และการพิมพ์ต้องไม่เปลี่ยนสถานะออเดอร์
- **Verification intent (derived, not a new decision):** พิมพ์ได้โดยไม่เกิด Side Effect ต่อธุรกรรม
- Current implementation: **PARTIAL**. Evidence: E12. Browser print calls exist for sales and restaurant tables. Complete kitchen ticket/receipt print coverage and no-side-effect acceptance remain open.
- Trace: [D09](design.md#d09); [T3.5](tasks.md#t3-5).

### VLP-056 - Standard Sales Receipt Management

- Source / approved decision: [approved register](approved-requirements.md), Scope 56 / **B**.
- **Approved requirement:** ร้านมีเลขใบรับเงิน/ใบเสร็จอ้างอิงธุรกรรม แสดงรายการสินค้า ยอดจ่าย ส่วนลด ค่าส่ง และการอ้างอิง Cancel/Refund รองรับ PDF/Browser Print ไม่รวมใบกำกับภาษีเต็มรูปหรือ e-Tax และห้ามแสดง Paid ก่อน Provider ยืนยัน
- **Verification intent (derived, not a new decision):** Receipt อ้างอิงเฉพาะรายการจ่ายยืนยันแล้ว; Refund ไม่ลบใบเสร็จเดิม
- Current implementation: **PARTIAL**. Evidence: E12, E06. Retail receipt numbering and sales records exist; restaurant-native provider-paid receipts and preserved cancellation/refund references need acceptance.
- Trace: [D09](design.md#d09); [T3.5](tasks.md#t3-5).

### VLP-057 - Standard Restaurant Promotions and Coupons

- Source / approved decision: [approved register](approved-requirements.md), Scope 57 / **B**.
- **Approved requirement:** ร้านสร้างราคาพิเศษตามช่วงเวลา ส่วนลดจำนวนเงิน/เปอร์เซ็นต์ คูปอง เงื่อนไขขั้นต่ำ เมนูที่ร่วมรายการ ช่วงเวลา และข้อจำกัดจำนวนครั้ง/รายคน ตรวจสอบและจองสิทธิ์แบบ Atomic ที่ Backend ไม่บังคับโปรโมชัน Buy-X-Get-Y ขั้นสูง
- **Verification intent (derived, not a new decision):** คูปองใช้เกินสิทธิ์ไม่ได้; Checkout คำนวณราคาจาก Backend
- Current implementation: **PARTIAL**. Evidence: E11. Retail pricing/promotions exist; restaurant coupons, per-person limits and atomic checkout entitlement reservations are not established.
- Trace: [D06](design.md#d06); [T3.7](tasks.md#t3-7).

### VLP-058 - Restaurant-Specific Loyalty Points

- Source / approved decision: [approved register](approved-requirements.md), Scope 58 / **B**.
- **Approved requirement:** สมาชิกได้รับแต้มจากออเดอร์อาหารที่ Paid และ Completed ตามอัตรา/อายุแต้มของแต่ละร้าน แลกแต้มเป็นส่วนลดได้ แต้มร้านแยก Ledger และปรับเมื่อ Cancel/Refund Guest ยังสั่งได้โดยไม่ต้องสะสม
- **Verification intent (derived, not a new decision):** ไม่ใช้แต้มข้ามร้าน; ไม่ Earn ก่อน Completed; Ledger ตรวจสอบได้
- Current implementation: **CONFLICTING**. Evidence: E11. Current loyalty earns on a committed retail sale grand_total. That is not proof of Paid AND verified Completed food-only earning for a restaurant order.
- Trace: [D10](design.md#d10); [T6.5](tasks.md#t6-5).

### VLP-059 - Discounted Price with One Additional Benefit

- Source / approved decision: [approved register](approved-requirements.md), Scope 59 / **B**.
- **Approved requirement:** ราคาสินค้าที่ลดตาม Promotion สามารถรวมกับ Coupon หนึ่งรายการ หรือการแลก Points อย่างใดอย่างหนึ่งเท่านั้น ห้าม Coupon+Points พร้อมกันหรือซ้อนหลาย Coupon ระบบคิดยอดสุทธิโดย Backend และปล่อยสิทธิ์เมื่อ Unpaid ที่ยืนยันแล้ว แต้ม Earn บนยอดค่าอาหารสุทธิที่มีสิทธิ์ ไม่รวมค่าส่ง
- **Verification intent (derived, not a new decision):** คูปองและแต้มไม่ Stack กัน; Refund/Failure มี Atomic Reservation Rollback
- Current implementation: **PARTIAL**. Evidence: E11. Pricing and points discount seams exist. One-coupon XOR points, food-net earn base excluding delivery, and confirmed-unpaid release are not established.
- Trace: [D06](design.md#d06); [T3.7](tasks.md#t3-7), [T6.5](tasks.md#t6-5).

### VLP-060 - Advanced In-App Customer–Restaurant Chat

- Source / approved decision: [approved register](approved-requirements.md), Scope 60 / **C**.
- **Approved requirement:** ลูกค้าและร้านติดต่อกันทั้งก่อนและหลังสั่งอาหารผ่าน In-App Chat รองรับข้อความ รูปภาพ/ไฟล์แนบ ประวัติ และ Admin Moderation/Reports โดยรักษา Tenant/Guest Privacy; แยกจาก AI Assistant และ Support Disputes; ไม่มี LINE
- **Verification intent (derived, not a new decision):** ข้อความเข้าถึงได้เฉพาะคู่สนทนาที่ได้รับอนุญาต; รายงานแชตให้ Admin ตรวจสอบได้
- Current implementation: **MISSING**. Evidence: E10, E16. AI chat UI is not customer-restaurant chat. No authorized pre/post-order messaging, attachments or moderation workflow was found.
- Trace: [D11](design.md#d11); [T6.6](tasks.md#t6-6).

### VLP-061 - Controlled Post-Payment Order Amendment

- Source / approved decision: [approved register](approved-requirements.md), Scope 61 / **B**.
- **Approved requirement:** ก่อน Preparing เท่านั้น ร้านเสนอแก้เมนูด้วยการแทนที่หรือเอาออก โดยยอดใหม่ห้ามมากกว่าเดิม ลูกค้าต้องอนุมัติ หากยอดลด ร้านคืนส่วนต่างเองและบันทึก Ledger/Refund ปรับ Coupon/Points อย่างถูกต้อง ยังคงเวลาเข้าคิว FIFO เดิม; หลัง Preparing ไม่มี Routine Amendment
- **Verification intent (derived, not a new decision):** ร้านแก้ Paid Order ไม่ได้ฝ่ายเดียว; ไม่มีการเรียกเก็บเพิ่ม; FIFO Timestamp ไม่เปลี่ยน
- Current implementation: **MISSING**. Evidence: E07, E16. No customer-approved pre-Preparing substitution/removal with non-increasing total, manual difference refund and unchanged FIFO time was found.
- Trace: [D09](design.md#d09); [T3.6](tasks.md#t3-6).

### VLP-062 - Fixed Global Payment Timeout

- Source / approved decision: [approved register](approved-requirements.md), Scope 62 / **A**.
- **Approved requirement:** ใช้กรอบเวลารอชำระเงินมาตรฐานเดียวทั่วแพลตฟอร์ม ร้านปรับเองไม่ได้ จำนวนที่แน่นอนยังไม่กำหนด (15 นาทีเคยเป็นเพียงตัวอย่าง) Pending ไม่เข้าคิว ต้องตรวจสอบ Provider ก่อน Expire และปล่อย Coupon/Points/Quota เมื่อยืนยัน Unpaid เท่านั้น Unknown ไป Reconciliation
- **Verification intent (derived, not a new decision):** ร้านเปลี่ยน Timeout ไม่ได้; ไม่คืน Reservation หาก Payment Unknown
- Current implementation: **PARTIAL**. Evidence: E06. Current code embeds payment/order expiry windows. These are legacy values, not approval of the global timeout or of 15 minutes. Safe reservation release still needs policy and acceptance.
- Trace: [D07](design.md#d07); [T3.3](tasks.md#t3-3).

### VLP-063 - Automated Payment Reconciliation plus Manual Exceptions

- Source / approved decision: [approved register](approved-requirements.md), Scope 63 / **B**.
- **Approved requirement:** ระบบตรวจสอบสถานะ Provider เป็นรอบเพื่อกู้รายการ Callback หาย/ช้า และ Payment Pending/Timeout ได้อย่างปลอดภัย รายการที่จ่ายภายในหน้าต่างที่อนุญาตต้องกู้ Paid Order เดิมได้โดยไม่ซ้ำ รายการ Late Paid หรือผลไม่ชัดเจนเข้าสู่ Merchant/Admin Investigation และ Refund หากต้องดำเนินการ
- **Verification intent (derived, not a new decision):** Recovery ไม่สร้าง Order/FIFO ซ้ำ; เก็บเวลาจ่ายจริงและเหตุผิดปกติสำหรับสอบสวน
- Current implementation: **PARTIAL**. Evidence: E06. Provider lookup and durable reconciliation records exist. Periodic recovery, real paid-time FIFO recovery and late-paid investigation remain incomplete.
- Trace: [D07](design.md#d07); [T3.3](tasks.md#t3-3).

### VLP-064 - Structured Food Refund Workflow and Escalation

- Source / approved decision: [approved register](approved-requirements.md), Scope 64 / **B**.
- **Approved requirement:** มี Refund Reference สำหรับ Full/Partial Refund, กำหนด Deadline ตามนโยบาย, Reminders, Overdue Alerts และ Admin Escalation ลูกค้าแจ้งไม่ได้รับเงินผ่าน Support ได้ ร้านอาหารเป็นผู้โอนคืนเองพร้อมหลักฐาน; สถานะร้านแจ้งโอนแล้วไม่พิสูจน์ว่าลูกค้าได้รับเงินแน่
- **Verification intent (derived, not a new decision):** Refund มี Reference/Deadline/Audit; Platform ไม่คืนเงินค่าอาหารแทนร้าน; Dispute เปิดได้แม้มี Slip
- Current implementation: **CONFLICTING**. Evidence: E07. Provider-refund primitives do not satisfy merchant-direct full/partial food refunds, deadlines, reminders, evidence disputes and escalation.
- Trace: [D09](design.md#d09); [T3.6](tasks.md#t3-6).

### VLP-065 - Verified Restaurant Onboarding

- Source / approved decision: [approved register](approved-requirements.md), Scope 65 / **B**.
- **Approved requirement:** Admin ตรวจสอบหลักฐานตัวตนเจ้าของร้าน ที่ตั้งจริง ข้อมูลร้าน และความสัมพันธ์ระหว่างผู้ขายกับบัญชีรับเงินก่อนอนุมัติร้านแยกกัน; เมื่อเปลี่ยนข้อมูลสำคัญต้อง Re-verification; เก็บเอกสารอย่างจำกัดสิทธิ์และอายุข้อมูลที่เหมาะสม ไม่สมมติว่าทุกร้านต้องจดทะเบียนธุรกิจ/ภาษีแบบเดียวกัน
- **Verification intent (derived, not a new decision):** ร้าน Pending Verified ขายไม่ได้; เปลี่ยนบัญชีรับเงินต้องตรวจสอบก่อนเปิดใช้
- Current implementation: **MISSING**. Evidence: E02, E16. Restaurant profile completion is not Admin verification of identity, physical site and receiving-account relationship. No matching protected evidence/reverification workflow was found.
- Trace: [D02](design.md#d02); [T3.1](tasks.md#t3-1).

### VLP-066 - Structured Suspension and Appeal

- Source / approved decision: [approved register](approved-requirements.md), Scope 66 / **B**.
- **Approved requirement:** Platform Admin ออก Warning, Temporary Suspension หรือ Revocation ตามระดับปัญหา พร้อมเหตุผล/หลักฐาน/Audit ร้านอุทธรณ์หรือแก้ไขเพื่อรับ Admin Re-approval; ร้านที่ระงับหยุดรับออเดอร์/จ่ายใหม่และ Ads ที่ไม่ควรหักเพิ่ม แต่ต้องรักษา Paid Orders, Refunds, Support และ Ad Wallet
- **Verification intent (derived, not a new decision):** Suspended ไม่รับออเดอร์ใหม่; ประวัติ/ภาระคงอยู่; มี Appeal Trail
- Current implementation: **MISSING**. Evidence: E16. No warning/suspension/revocation/appeal workflow preserving paid orders, refunds, support, ads and wallet obligations was found.
- Trace: [D12](design.md#d12); [T3.8](tasks.md#t3-8).

### VLP-067 - Admin-Verified Ownership Transfer and Secure Recovery

- Source / approved decision: [approved register](approved-requirements.md), Scope 67 / **B**.
- **Approved requirement:** รองรับกู้บัญชีและโอนสิทธิ์ Owner ร้านให้คนใหม่เมื่อ Admin ตรวจสอบตัวตน สิทธิ์ในการโอน และบัญชีรับเงินใหม่ก่อนอนุมัติ ร้านหนึ่งมี Owner เพียงหนึ่งบัญชี ณ เวลาเดียวกัน เพิกถอนสิทธิ์/Session เดิมอย่างปลอดภัยและเก็บ Audit; การโอนไม่โอนยอดในธนาคารหรือภาระย้อนหลังโดยอัตโนมัติ
- **Verification intent (derived, not a new decision):** ไม่มี Owner สองคนพร้อมกัน; ไม่เปลี่ยนบัญชีรับเงินข้าม Verification
- Current implementation: **MISSING**. Evidence: E01, E17. Generic identity recovery and memberships do not establish Admin-verified restaurant transfer, new receiving-account verification and old-owner session revocation.
- Trace: [D05](design.md#d05); [T3.8](tasks.md#t3-8).

### VLP-068 - Structured Restaurant Closure and Archival

- Source / approved decision: [approved register](approved-requirements.md), Scope 68 / **B**.
- **Approved requirement:** เจ้าของร้านยื่นปิดกิจการผ่าน Dashboard แล้วหยุดออเดอร์ใหม่ ตรวจสอบ/จัดการ Paid Orders, Refunds, Support Tickets, Ads Campaign/Wallet และ Pro ก่อน Admin Archive ร้าน; ไม่ลบหลักฐานหรือปลดภาระโดยอัตโนมัติ; Reopen ต้อง Admin Re-approval
- **Verification intent (derived, not a new decision):** Archived ไม่ขายได้แต่ประวัติจำเป็นยังอยู่; Refund/Support ค้างดำเนินการได้
- Current implementation: **MISSING**. Evidence: E16. No owner-requested closure, obligation review, Admin archival and reapproval-to-reopen workflow was found.
- Trace: [D12](design.md#d12); [T3.8](tasks.md#t3-8).

### VLP-069 - Comprehensive Restaurant Data Export

- Source / approved decision: [approved register](approved-requirements.md), Scope 69 / **B**.
- **Approved requirement:** เจ้าของส่งออกเฉพาะข้อมูลร้านที่มีสิทธิ์ ได้แก่ เมนู หมวดหมู่ ราคา ประวัติออเดอร์ รายงาน โปรโมชัน รีวิว และโปรไฟล์ธุรกิจใน CSV/Excel/JSON ตามประเภทข้อมูล รองรับดาวน์โหลดเป็นชุด ประวัติคำขอ และ Privacy Controls เช่น PII Redaction, Tenant Isolation, Auth/Audit, ลิงก์หมดอายุ
- **Verification intent (derived, not a new decision):** Export ไม่มีข้อมูลข้ามร้านหรือข้อมูลลูกค้าเกินสิทธิ์; ไม่ลบข้อมูลต้นฉบับ
- Current implementation: **PARTIAL**. Evidence: E14. Catalog import/export seams do not cover comprehensive scoped restaurant exports, redaction, request history and expiring batch-download links.
- Trace: [D14](design.md#d14); [T6.10](tasks.md#t6-10).

### VLP-070 - Role-Based Authentication Security and Recovery

- Source / approved decision: [approved register](approved-requirements.md), Scope 70 / **B**.
- **Approved requirement:** ลูกค้ามี Email/Password และ Social Login พร้อม Guest Checkout; มี Email Verification, Password Recovery และ Session Management; Owner/Admin บังคับ MFA และ Re-auth ก่อน Sensitive Actions เช่น บัญชีรับเงิน โอนร้าน คืนเครดิตโฆษณา; Secure Recovery ต้องไม่ให้ Password Reset ข้าม MFA ได้; Backend ใช้ RBAC/Tenant Isolation
- **Verification intent (derived, not a new decision):** Owner/Admin เปลี่ยน Sensitive Data โดยไม่ผ่าน Re-auth ไม่ได้; Guest ไม่บังคับสมัคร
- Current implementation: **PARTIAL**. Evidence: E17 and [T1.3](tasks.md#t1-3). Email/password, Google, verified primary proof, TOTP, and recovery-code replacement are implemented. Local database tests cover the replacement transaction, prior session revocation and password sign-in with the new TOTP. Full Owner/Admin enforcement, production consumers for sensitive commands, live Google proof delivery and manual recovery evidence remain open.
- Trace: [D05](design.md#d05); [T1.3](tasks.md#t1-3), [T6.4](tasks.md#t6-4).

### VLP-071 - Secure Guest Order Claiming

- Source / approved decision: [approved register](approved-requirements.md), Scope 71 / **B**.
- **Approved requirement:** สมาชิกเชื่อมออเดอร์ Guest เดิมเข้าบัญชีทีละออเดอร์ด้วยหลักฐานการครอบครองออเดอร์หรือ Token ที่ปลอดภัย เลขออเดอร์/อีเมล/เบอร์ติดต่อที่ตรงกันอย่างเดียวไม่พอ ป้องกัน Claim ซ้ำ ไม่เปลี่ยนสถานะชำระ ไม่สร้างรีวิวหรือ Loyalty Points ย้อนหลังอัตโนมัติ
- **Verification intent (derived, not a new decision):** Order ถูก Claim โดยผู้มีสิทธิ์ครั้งเดียว; Claim ไม่เพิ่มแต้มเอง
- Current implementation: **MISSING**. Evidence: E03, E16. Guest tracking is not secure per-order member claiming. No ownership-proof claim transaction or replay-safe account link was found.
- Trace: [D10](design.md#d10); [T6.4](tasks.md#t6-4).

### VLP-072 - Verified Retroactive Loyalty Request

- Source / approved decision: [approved register](approved-requirements.md), Scope 72 / **B**.
- **Approved requirement:** หลัง Secure Guest Claim สมาชิกกดขอแต้มจาก Guest Order ย้อนหลังได้ภายในช่วงเวลา Policy ที่ยังไม่กำหนด ระบบตรวจ Paid, Completed, Refund/ยอดสุทธิ และตรวจไม่เคยให้แต้มออเดอร์นั้นก่อน มี Atomic/Idempotent Points Ledger แยกร้าน; ไม่เพิ่มแต้มจากการ Claim อัตโนมัติ
- **Verification intent (derived, not a new decision):** คำขอครั้งที่สองไม่ให้แต้มซ้ำ; Refund กระทบสิทธิ์อย่างถูกต้อง
- Current implementation: **MISSING**. Evidence: E11, E16. No explicit, window-bound retroactive points request after secure Guest claim was found. Claim must not automatically earn points.
- Trace: [D10](design.md#d10); [T6.5](tasks.md#t6-5).

### VLP-073 - Batch Points Ledger, FEFO, and Automatic Reversal

- Source / approved decision: [approved register](approved-requirements.md), Scope 73 / **B**.
- **Approved requirement:** แต้มแยก Batch และ Expiry ใช้แต้มที่หมดอายุก่อน แจ้งเตือนใกล้หมดอายุ บันทึก Earn/Redeem/Expire/Reverse/Restore ใน Ledger ตรวจสอบได้ ปรับแต้มอัตโนมัติเมื่อ Full/Partial Refund รวมแต้มที่ได้รับไปแล้วถูกใช้ (ติดตามยอดค้างปรับ/ชดเชยตามนโยบาย) และคืนแต้มที่แลกเมื่อมีสิทธิ์โดยรักษากฎหมดอายุ
- **Verification intent (derived, not a new decision):** ไม่ Reversal ซ้ำ; ไม่ใช้/คืนแต้มข้ามร้าน; Ledger ไม่ลบเหตุการณ์
- Current implementation: **PARTIAL**. Evidence: E11. Retail ledger has earn/redeem and return reversal/debt seams. Expiring point batches, FEFO, expiry-preserving restore and restaurant partial-refund allocation are not established.
- Trace: [D10](design.md#d10); [T6.5](tasks.md#t6-5).

### VLP-074 - Loyalty Grace Period and Protected Points

- Source / approved decision: [approved register](approved-requirements.md), Scope 74 / **B**.
- **Approved requirement:** ก่อนร้านหยุด Loyalty Program ต้องแจ้งล่วงหน้า หยุด Earn ตามวันกำหนดและให้ลูกค้า Redeem แต้มคงเหลือช่วง Grace Period ตามนโยบาย; หากร้าน Suspended พัก Earn/Redeem แต่ไม่ลบยอด; ก่อน Archived ต้องตรวจแต้มค้างและแจ้งลูกค้า; ไม่แปลงแต้มเป็นเงินสดหรือโอนข้ามร้านอัตโนมัติ
- **Verification intent (derived, not a new decision):** แต้มไม่หายจาก Pause; ปิดโปรแกรมตามเงื่อนไขแจ้งล่วงหน้าและ Audit
- Current implementation: **MISSING**. Evidence: E11, E16. No program notice/grace workflow, suspension freeze and archival obligation review for protected restaurant points was found.
- Trace: [D10](design.md#d10); [T6.5](tasks.md#t6-5).

### VLP-075 - No Customer Referral Program

- Source / approved decision: [approved register](approved-requirements.md), Scope 75 / **A**.
- **Approved requirement:** ยังไม่มี Referral Codes, Referral Rewards หรือ Referral Analytics ใน Scope นี้ ลูกค้าแชร์ลิงก์ร้านหรือเมนูได้ตามปกติโดยไม่มีการติดตามหรือจ่ายรางวัลชวนเพื่อน
- **Verification intent (derived, not a new decision):** ไม่มี Referral Reward Issuance หรือ Self-Referral Logic เป็นข้อบังคับ
- Current implementation: **IMPLEMENTED**. Evidence: E16. Static exclusion only: no referral program identifiers were found in the bounded runtime/contract/schema scan. Ordinary sharing is not referral reward approval.
- Trace: [D10](design.md#d10); [T6.12](tasks.md#t6-12).

### VLP-076 - Granular Marketing Consent

- Source / approved decision: [approved register](approved-requirements.md), Scope 76 / **B**.
- **Approved requirement:** แยก Service Notifications (Orders/Payments/Refunds/Security) จาก Marketing Notifications; ลูกค้า Opt-in แยกโปรโมชัน คูปอง ร้านแนะนำ และถอนหรือเปลี่ยน Consent ได้ตลอด พร้อม Consent History; Browser Push ต้องได้รับ Browser Permission ไม่มี LINE
- **Verification intent (derived, not a new decision):** ไม่ส่ง Marketing ถึงผู้ไม่ Opt-in; Order Status ในเว็บยังดูได้แม้ไม่เปิด Push
- Current implementation: **PARTIAL**. Evidence: E09, E16. A retail customer marketing_consent Boolean exists. Granular category opt-ins, withdrawal history and push-permission separation are missing.
- Trace: [D11](design.md#d11); [T6.6](tasks.md#t6-6).

### VLP-077 - Rule-Based Personalized Recommendations

- Source / approved decision: [approved register](approved-requirements.md), Scope 77 / **B**.
- **Approved requirement:** หน้า Marketplace แนะนำร้าน/เมนูโดยใช้ Favorites, Order History, หมวดหมู่สนใจ และบริบท Open/Availability/Queue ตามกฎที่อธิบายได้ ให้ลูกค้าปิด Personalization ได้ Guest เห็น General Recommendations และ Sponsored แยกชัดเจนจาก Organic/AI Chat
- **Verification intent (derived, not a new decision):** ปิด Personalization แล้วยังใช้บริการหลักได้; ไม่ปะปน Sponsored เป็น Organic
- Current implementation: **PARTIAL**. Evidence: E03, E10. Local favorites and open-store filtering are reuse seams. Rule-based member recommendations, opt-out and Sponsored separation are not implemented by the keyword assistant.
- Trace: [D04](design.md#d04); [T6.12](tasks.md#t6-12).

### VLP-078 - Real-Time Menu Availability and Optional Quantity Limits

- Source / approved decision: [approved register](approved-requirements.md), Scope 78 / **B**.
- **Approved requirement:** ร้านเปิด/ปิดขายเมนูและตั้งโควตาจำนวนจานต่อเมนูแบบไม่บังคับ แจ้ง Sold-Out แบบ Real-Time ตรวจสอบราคาตัวเลือก/โควตาโดย Backend ก่อนเริ่มชำระ จองโควตาชั่วคราวแบบ Atomic เมื่อเข้าสู่ Payment หากผลจ่ายไม่แน่นอนห้ามปล่อยจน Reconcile; Paid Order จัดการ Amendment/Refund แทนการลบทิ้ง ไม่มี Ingredient Inventory
- **Verification intent (derived, not a new decision):** Concurrent Checkout ไม่ Oversell; Pending Unknown คง Reservation จนผลชัดเจน
- Current implementation: **PARTIAL**. Evidence: E02, E06, E14. Sold-out flags and legacy stock/hold checks exist. Optional per-menu dish quotas reserved at payment with unknown-state retention need a restaurant-native path.
- Trace: [D06](design.md#d06); [T3.7](tasks.md#t3-7).

### VLP-079 - Real-Time Modifier Availability and Optional Quantity Limits

- Source / approved decision: [approved register](approved-requirements.md), Scope 79 / **B**.
- **Approved requirement:** ร้านเปิด/ปิด Option/Topping และตั้งโควตาแบบไม่บังคับ อัปเดต Real-Time ตรวจราคาและจองโควตาตัวเลือกกับเมนูหลักแบบ Atomic เมื่อเข้าสู่ Payment หากตัวเลือกหมดก่อนจ่ายต้องให้ลูกค้าเลือกใหม่และยืนยันราคา ไม่แทนให้อัตโนมัติ; Paid Order ใช้ Controlled Amendment/Refund
- **Verification intent (derived, not a new decision):** การจอง Option/Main Menu สำเร็จหรือไม่สำเร็จพร้อมกัน; ไม่เปลี่ยน Option ให้ลูกค้าเอง
- Current implementation: **MISSING**. Evidence: E02, E16. No modifier/topping quota model or atomic menu-plus-option reservation was found.
- Trace: [D06](design.md#d06); [T3.7](tasks.md#t3-7).

### VLP-080 - Persistent Cart and Member Cross-Device Sync

- Source / approved decision: [approved register](approved-requirements.md), Scope 80 / **B**.
- **Approved requirement:** Guest บันทึกตะกร้าแยกตามร้านบนอุปกรณ์เดิม สมาชิกซิงก์ตะกร้าแยกร้านข้ามอุปกรณ์หลังเข้าสู่ระบบ มี Cart Expiration, Version/Concurrency Control และ Backend Revalidation เมื่อ Checkout; การบันทึกไม่จองโควตาก่อนเริ่มชำระ; Dine-in Table Session ต้องไม่ถูกย้าย/รั่วไหลและการกู้ตะกร้าไม่สั่งหรือจ่ายเอง
- **Verification intent (derived, not a new decision):** แก้ Cart พร้อมกันไม่ทับกันเงียบ ๆ; Guest อุปกรณ์อื่นไม่เห็นตะกร้าอัตโนมัติ
- Current implementation: **PARTIAL**. Evidence: E03. Guest carts persist by restaurant slug on one device. Member cross-device sync, expiry and server version/conflict rules are missing.
- Trace: [D06](design.md#d06); [T3.2](tasks.md#t3-2), [T6.4](tasks.md#t6-4).

### VLP-081 - End-to-End Idempotent Checkout

- Source / approved decision: [approved register](approved-requirements.md), Scope 81 / **B**.
- **Approved requirement:** ใช้ Persistent Idempotency Key ผูก Checkout Intent, Request Fingerprint และ Merchant/Customer หรือ Guest Session; Safe Retry ต้องกลับ Order/Payment Attempt เดิม ไม่สร้าง Order/Payment/Queue/Quota/Coupon/Points ซ้ำ; Key เดิม Payload ใหม่ต้อง Reject; ใช้ Transactions/Unique Constraints/Atomic Operations และ Reconciliation สำหรับ Payment Unknown
- **Verification intent (derived, not a new decision):** Retry Request เดิมให้ผลธุรกิจเดิม; ไม่มี Order/Queue/Payment ซ้ำจาก Concurrent Requests
- Current implementation: **PARTIAL**. Evidence: E03, E06. Order fingerprint replay, payment dispatch identity and queue uniqueness seams exist. End-to-end persistent checkout replay across all quotas/coupons/points is not accepted.
- Trace: [D06](design.md#d06); [T3.2](tasks.md#t3-2), [T3.3](tasks.md#t3-3), [T3.7](tasks.md#t3-7).

### VLP-082 - Guided Payment Recovery and Safe Retry UX

- Source / approved decision: [approved register](approved-requirements.md), Scope 82 / **B**.
- **Approved requirement:** แสดง Real-Time Payment Status, Countdown และ Checking Payment; เมื่อผลจ่ายไม่ชัดเจนต้องตรวจ Provider/Reconciliation และห้ามสร้าง QR ใหม่จนยืนยัน Unpaid ปลอดภัย; New Payment Attempt ผูก Checkout/Order เดิมและตรวจสอบราคา/โควตาที่เกี่ยวข้องใหม่ มี Support เมื่อเงินถูกหักแต่ระบบไม่ยืนยัน; ผู้ใช้หรือ Slip ไม่ยืนยัน Paid แทน Provider
- **Verification intent (derived, not a new decision):** Pending/Unknown ป้องกัน Retry ที่เสี่ยง; Safe Retry ไม่สร้างออเดอร์หรือคิวซ้ำ
- Current implementation: **PARTIAL**. Evidence: E06, E09. Customer checkout/status/recovery routes and tracking UI exist. Safe same-order new attempts only after confirmed unpaid, approved countdown and unknown-state recovery require acceptance.
- Trace: [D07](design.md#d07); [T3.3](tasks.md#t3-3), [T4.2](tasks.md#t4-2).

### VLP-083 - Controlled Payment Provider Degraded Mode

- Source / approved decision: [approved register](approved-requirements.md), Scope 83 / **B**.
- **Approved requirement:** ตรวจสุขภาพ Payment Provider เมื่อใช้งานไม่ได้พัก Checkout/สร้าง Payment ใหม่ แสดงสถานะและให้เก็บตะกร้า ออเดอร์ Verified Paid ที่มีอยู่ทำต่อ รายการ Pending/Unknown เข้า Reconciliation โดยไม่คืน Reservation หรือให้จ่ายซ้ำอย่างไม่ปลอดภัย; เมื่อฟื้นให้ตรวจความพร้อมและเปิด Checkout อย่างควบคุมพร้อม Revalidation; ไม่มี Multi-Provider Failover บังคับ
- **Verification intent (derived, not a new decision):** Provider ล่มไม่ทำให้ Paid Order หยุด; ไม่เริ่มธุรกรรมใหม่ระหว่าง Degraded
- Current implementation: **PARTIAL**. Evidence: E06. Disabled/unavailable payment guards exist. Full provider-health degraded mode, retained reservations and controlled revalidation/reopening are not established.
- Trace: [D07](design.md#d07); [T3.3](tasks.md#t3-3).

### VLP-084 - Dynamic ETA and Owner Manual Pause Only

- Source / approved decision: [approved register](approved-requirements.md), Scope 84 / **A**.
- **Approved requirement:** แสดงจำนวนคิวและ ETA ให้ลูกค้า/ร้าน ร้านกด Pause เองทั้งหมดหรือแยกช่องทางตามขอบเขตเดิม ไม่มี Threshold-Based Queue Overload Alerts เพิ่มเติมและไม่มี Auto-Pause จากจำนวนคิวหรือ ETA; Paid Orders ทำต่อ FIFO เดียว
- **Verification intent (derived, not a new decision):** ระบบไม่หยุดรับตามคิวล้นโดยอัตโนมัติ; Pause ตามการสั่งของ Owner เท่านั้น
- Current implementation: **PARTIAL**. Evidence: E02, E05, E16. Manual accepting_orders exists and no dynamic ETA implementation was found. Queue counts/ETA and per-mode pause need work; no overload alert or auto-pause is added.
- Trace: [D08](design.md#d08); [T3.1](tasks.md#t3-1), [T3.4](tasks.md#t3-4).

### VLP-085 - Pickup Reminders and Structured No-Show

- Source / approved decision: [approved register](approved-requirements.md), Scope 85 / **B**.
- **Approved requirement:** สำหรับ Pickup/Takeaway ให้แจ้ง Ready และ Reminder ตามช่วงเวลาที่นโยบายกำหนด ร้านบันทึก No-Show เหตุผล เวลา และ Audit Trail แยกจาก Completed/Handover มี Support/Dispute หากขัดแย้ง ไม่มี Refund อัตโนมัติ ไม่ให้แต้ม/สิทธิ์รีวิวเพียงเพราะ No-Show
- **Verification intent (derived, not a new decision):** No-Show ไม่เป็น Completed; ไม่ปลอมหลักฐานส่งมอบ; แจ้งเตือนตามสิทธิ์
- Current implementation: **MISSING**. Evidence: E16. No audited No-Show state and timed Pickup/Takeaway reminder workflow was found. No-Show must not imply handover, completion, points, review or automatic refund.
- Trace: [D09](design.md#d09); [T3.5](tasks.md#t3-5), [T6.6](tasks.md#t6-6).

### VLP-086 - Structured Preparation Delay Reporting and Notifications

- Source / approved decision: [approved register](approved-requirements.md), Scope 86 / **B**.
- **Approved requirement:** ร้านแจ้งเหตุผลและเวลาล่าช้าโดยประมาณ ระบบอัปเดต Dynamic ETA แจ้งลูกค้าผ่านเว็บไซต์และ Browser Push ที่ได้รับอนุญาต เก็บ Delay History ลูกค้าสอบถามผ่าน In-App Chat ได้ ไม่เปลี่ยน Strict FIFO/Whole-Order Kitchen State และไม่ Auto-Refund
- **Verification intent (derived, not a new decision):** ETA/Delay Event แสดงให้ลูกค้าที่มีสิทธิ์; Delay ไม่ย้ายคิวหรือ Refund เอง
- Current implementation: **MISSING**. Evidence: E16. No structured preparation-delay reason/history, ETA update and consent-aware notification workflow was found.
- Trace: [D08](design.md#d08); [T3.4](tasks.md#t3-4), [T6.6](tasks.md#t6-6).

### VLP-087 - Controlled Kitchen Status Correction with Audit Trail

- Source / approved decision: [approved register](approved-requirements.md), Scope 87 / **B**.
- **Approved requirement:** Owner แก้สถานะ Queued/Preparing/Ready ที่กดผิดได้เฉพาะ Allowed Transitions ก่อน Handover ระบุเหตุผลและบันทึก Actor/Timestamp/Before/After และแจ้งลูกค้าหากสถานะผิดถูกแจ้งไปแล้ว; หาก Handover Verified ต้อง Admin Review ไม่แก้ FIFO/Paid Timestamp/Order Snapshot หรือ Audit เดิม และไม่ข้าม Amendment/Refund
- **Verification intent (derived, not a new decision):** แก้ Ready→Preparing ได้เมื่อยังไม่ Handover; Corrective Event ไม่ลบ Event เดิม
- Current implementation: **MISSING**. Evidence: E05, E16. Current transition map does not provide audited Ready-to-Preparing correction or post-handover Admin review.
- Trace: [D08](design.md#d08); [T3.4](tasks.md#t3-4).

### VLP-088 - Verified Completion with Payment and Fulfillment Records

- Source / approved decision: [approved register](approved-requirements.md), Scope 88 / **B**.
- **Approved requirement:** แยก Payment, Kitchen และ Fulfillment Lifecycle; Completed ต่อเมื่อยืนยันส่งมอบจริงตามช่องทาง: Dine-in ส่งถึงโต๊ะ, Takeaway/Pickup QR/รหัสเฉพาะออเดอร์, Self-Delivery รหัสลูกค้า บันทึก Provider Payment Evidence, Handover Evidence และ Audit; Ready/No-Show ไม่เป็น Completed; Full/Partial Refund เป็นรายการอ้างอิงเพิ่มเติมไม่ลบหลักฐานเดิม และอาหารรับเงินตรงร้าน
- **Verification intent (derived, not a new decision):** Completed ต้องมี Handover Verification; Refund ไม่ rewrite Historical Payment
- Current implementation: **CONFLICTING**. Evidence: E04, E07. Existing order/payment presentation can infer PAID_AT_STORE from COMPLETED and has no verified channel-handover record. It cannot prove the approved independent lifecycle/completion invariant.
- Trace: [D09](design.md#d09); [T3.5](tasks.md#t3-5).

### VLP-089 - Detailed Customer Real-Time Order Event Timeline

- Source / approved decision: [approved register](approved-requirements.md), Scope 89 / **B**.
- **Approved requirement:** ลูกค้าเห็นเหตุการณ์ Real-Time ของ Payment, Queue, Preparing, Delay, ETA Changes, Status Corrections, Ready, Handover และ Refund ตามลำดับเวลาจริงจาก Backend Immutable/Auditable History; เปิดเผยเฉพาะเจ้าของ Order (สมาชิก/Guest Secure Token) ไม่เปิดเผย Internal Audit, Fraud, PII/ข้อมูลลับของผู้อื่น และ Timeline ไม่เปลี่ยนสถานะธุรกรรมเอง
- **Verification intent (derived, not a new decision):** Event ลูกค้าเห็นเฉพาะ Allowed Fields; Correction เป็น Event ใหม่ ไม่ overwrite
- Current implementation: **PARTIAL**. Evidence: E03, E09. Token-scoped status events and polling exist. Full typed, immutable customer timeline with internal-audit/fraud/PII filtering is incomplete.
- Trace: [D11](design.md#d11); [T6.6](tasks.md#t6-6).

### VLP-090 - Advanced Order History Filters and Smart Reorder

- Source / approved decision: [approved register](approved-requirements.md), Scope 90 / **B**.
- **Approved requirement:** สมาชิกค้น/กรองประวัติด้วยชื่อร้าน ชื่อเมนู หมายเลขออเดอร์ วันที่ ช่องทาง และสถานะ; Reorder สร้าง Cart ใหม่จากข้อมูลเก่าที่ตรวจสอบราคา/Option/Topping/Availability/Quota ปัจจุบันโดย Backend แสดงรายการเปลี่ยน/หมดให้ผู้ใช้เลือกและยืนยัน ไม่ดึง Coupon/Points หรือ Table Session เดิมมาเอง ไม่เริ่ม Payment อัตโนมัติ; Guest เข้าถึงประวัติผ่าน Token/Claim
- **Verification intent (derived, not a new decision):** Reorder ไม่ใช้ราคาเก่าและไม่ชำระเอง; การค้นหาจำกัด Order ของผู้ใช้
- Current implementation: **PARTIAL**. Evidence: E03. Guest order tracking and cart storage exist, but member advanced history filters and current-data smart reorder are not established.
- Trace: [D10](design.md#d10); [T6.4](tasks.md#t6-4).

### VLP-091 - Immutable Order Snapshot and Menu Revision Audit

- Source / approved decision: [approved register](approved-requirements.md), Scope 91 / **B**.
- **Approved requirement:** เก็บ Order Snapshot ของชื่อรายการ Option ราคา ส่วนลด และยอดจริงขณะซื้อ; เก็บ Menu/Price/Option/Topping/Availability Revisions พร้อม Before/After, Actor, Timestamp; Restore เวอร์ชันเก่าโดยสร้าง Revision ใหม่ไม่แก้ธุรกรรมเก่าหรือ Audit เดิม; Pending Cart/Checkout ต้อง Revalidate Version/Price/Quota
- **Verification intent (derived, not a new decision):** แก้หรือ Restore เมนูไม่เปลี่ยนออเดอร์ Paid ในอดีต; Revision ติดตามย้อนหลังได้
- Current implementation: **PARTIAL**. Evidence: E03, E14. Order item/price snapshots and revision counters exist. Full menu/modifier/availability Before/After history and restore-as-new-revision are missing.
- Trace: [D03](design.md#d03); [T3.9](tasks.md#t3-9).

### VLP-092 - CSV/Excel Menu Import and Bulk Editing

- Source / approved decision: [approved register](approved-requirements.md), Scope 92 / **B**.
- **Approved requirement:** รองรับ Import Template ของเมนู หมวดหมู่ Option/Topping ผ่าน CSV/Excel พร้อม Validation, Preview, Duplicate Detection และแสดงรายการเพิ่ม/แก้ไข/ผิดพลาด; Bulk Actions สำหรับราคา หมวดหมู่ และสถานะขาย; Import Audit และ Menu Revisions ต้องตรวจ Tenant/Authorization และไม่เปลี่ยน Paid Order โดย Pending Cart ต้อง Revalidate
- **Verification intent (derived, not a new decision):** ไฟล์ผิดไม่เขียนข้อมูลอย่างไม่ปลอดภัย; Bulk Changes มี Revision/Audit และไม่ข้ามร้าน
- Current implementation: **PARTIAL**. Evidence: E14. CSV/XLSX catalog preview/import and tests exist. Approved restaurant category/modifier template, bulk actions and revision-preserving import semantics remain gaps.
- Trace: [D03](design.md#d03); [T3.9](tasks.md#t3-9).

## 5. Source-listed unresolved parameters

The following subjects were acknowledged but their precise values or implementation choices were **not** explicitly approved. Do not invent them when filling `requirements.md`, `design.md` or `tasks.md`:

| Related scope                   | Open decision / verification needed                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VLP-004`, `VLP-036`, `VLP-065` | Choose/verify an actual PromptPay Provider that supports reliable callback/query, merchant-specific direct settlement and any necessary recipient-account verification; determine fallback billing procedure. |
| `VLP-028`, `VLP-050`            | Define measurable ETA methodology and capacity/load SLOs; 1,000 restaurants / 5,000 concurrent / 10,000 orders/day are untested design targets, not proven capacity.                                          |
| `VLP-038`                       | Pro subscription monthly/yearly prices, benefits matrix details, advance expiry notifications and renewal timing.                                                                                             |
| `VLP-039`–`VLP-043`             | Fixed/CPC/CPM tariff values, attribution window, charge/refund policy, fraud detection thresholds and ad-wallet refund procedures.                                                                            |
| `VLP-046`, `VLP-047`            | Legal/data retention and deletion periods, PITR schedule, target RPO/RTO and recovery-test cadence.                                                                                                           |
| `VLP-057`–`VLP-059`             | Coupon quotas, eligibility periods, loyalty earn/redeem rates and expiry values per merchant; exact refund reversal allocation policy.                                                                        |
| `VLP-062`, `VLP-063`, `VLP-082` | **Global payment timeout duration** (15 minutes was only an example), query/reconciliation frequency, late-payment cutoff, hold/unlock timing and recovery SLAs.                                              |
| `VLP-064`                       | Refund deadline duration, reminder/escalation cadence, what evidence resolves disputes.                                                                                                                       |
| `VLP-065`–`VLP-068`             | Acceptable identity/merchant documents by merchant type, review policy, ownership transfer evidence, re-approval terms and closure legal/accounting checks.                                                   |
| `VLP-069`                       | Data Export format mapping and permitted customer fields; export job and link-expiration limits.                                                                                                              |
| `VLP-070`                       | Which Social Login providers, MFA methods and secure recovery verification steps are supported.                                                                                                               |
| `VLP-072`–`VLP-074`             | Retroactive points claim window, FEFO expiry/restoration edge cases, advance notice and grace-period durations, unsettled point policy on permanent closure.                                                  |
| `VLP-078`–`VLP-080`             | Reservation hold duration and safe allocation for concurrent menu/option quotas; saved-cart retention/conflict resolution exact rules.                                                                        |
| `VLP-085`, `VLP-086`            | Pickup reminder timing, No-Show evidence and delay notification timing/ETA updating rules.                                                                                                                    |
| `VLP-092`                       | Exact CSV/Excel template schema, supported file sizes, import transaction semantics and error handling.                                                                                                       |
| Unapproved future scope         | Scope 93+ has **not** been approved. Do not treat the presence of a question or assistant recommendation as an approved requirement.                                                                          |

## 6. Remaining gaps and blocker ownership

These are policy/provider/design inputs, not additional approved scope. A blocker
only prevents tasks that depend on it; it does not make all documentation work
blocked or turn an approved feature into a post-MVP candidate. Product authority
resolves business policy; technical owners propose implementation details for
review. External provider verification requires separate authorization.

| ID  | Decision / input                                                      | Approved links                                       | Dependent tasks  | Resolution / remaining evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B01 | RESOLVED: restaurant identity mapping, Option A                       | VLP-010, VLP-031, VLP-034                            | T1.1, T1.3, T2.1 | User selected A on 2026-11-19: one organization per restaurant; one Owner may manage separate organizations. Keep organization as tenant/restaurant identity and retain legacy branch records/callers until replacement acceptance. Detailed adapter, multiple-Owner retained-data handling, constraints and backfill remain T1.1/T1.3/T2.1 work, not new product decisions. No application change or migration is authorized.                                                                                                                                                                             |
| B02 | Actual PromptPay provider and settlement/evidence contract            | VLP-004, VLP-036, VLP-065                            | T3.1, T3.3, T6.8 | Public-document shortlist recorded in D07 on 2026-11-22: SCB, KBank and Omise/Opn. Verify merchant-direct settlement, eligible receiving accounts, authenticated callback/query evidence, paid-time semantics and separate platform billing fallback. No application, merchant-data transmission, paid call or provider selection occurred.                                                                                                                                                                                                                                                                |
| B03 | Payment and reconciliation policy                                     | VLP-062, VLP-063, VLP-082, VLP-083                   | T3.3             | Set global timeout, query/recovery cadence, late-paid cutoff, hold/unlock timing and SLAs. Fifteen minutes and current code intervals are not approvals.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| B04 | Paid-time FIFO recovery and ETA/capacity acceptance                   | VLP-005, VLP-028, VLP-050, VLP-063, VLP-084          | T1.1, T3.4, T6.3 | Specify equal-paid-time tie/dispatch and delayed earlier-payment handling without inventing queue priority. Define ETA methodology and measurable load/SLO acceptance. Stated scale remains an untested target.                                                                                                                                                                                                                                                                                                                                                                                            |
| B05 | Pro entitlements, pricing and renewal timing                          | VLP-037, VLP-038                                     | T6.8             | Define detailed benefits matrix, monthly/yearly prices and notice/renewal timing. Free core selling and manual renewal are already settled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| B06 | Advertising rating, attribution and refunds                           | VLP-039, VLP-040, VLP-041, VLP-042, VLP-043, VLP-045 | T6.9             | Define fixed/CPC/CPM rates, event validity, attribution window, charge/refund allocation, fraud thresholds and unused-credit refund procedure.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| B07 | Retention, privacy requests and evidence policy                       | VLP-046, VLP-064, VLP-065                            | T3.6, T6.6, T6.7 | Define data retention/deletion and restricted evidence rules, refund deadlines/reminders/escalation and dispute-resolution evidence. No legal durations are inferred.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| B08 | Operational recovery and release targets                              | VLP-047, VLP-048, VLP-049, VLP-050                   | T6.3             | Define RPO/RTO, PITR/drill cadence, availability/latency/alert thresholds, staging/release targets and recovery ownership. Separate external/deployment authorization is still required.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| B09 | Promotion and refund benefit allocation                               | VLP-057, VLP-058, VLP-059, VLP-061, VLP-073          | T3.6, T3.7, T6.5 | Set merchant rates/quotas/eligibility/expiry and precise full/partial-refund allocation/rounding. Coupon XOR points and eligible net food excluding delivery are settled.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B10 | Merchant verification, transfer and closure evidence                  | VLP-065, VLP-066, VLP-067, VLP-068                   | T3.1, T3.8       | Define merchant-type documents, account relationship proof, review/appeal/reapproval/transfer rules and closure legal/accounting checks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| B11 | Export data and download contract                                     | VLP-069                                              | T6.10            | Map CSV/Excel/JSON by dataset, permitted/redacted customer fields, job limits and download link expiry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| B12 | PARTIAL: methods, five-minute reauth and restricted recovery selected | VLP-070                                              | T1.3, T6.4       | User selected Google plus Email/Password, TOTP MFA and single-use recovery codes on 2026-11-22. Sensitive actions require fresh password/Google plus TOTP within five minutes. Recovery code plus primary login permits TOTP replacement and revokes all prior sessions. Loss of TOTP and all recovery codes restricts privileged access pending Admin evidence verification; manual recovery evidence remains unresolved; platform Admin provisioning will use an audited server command with a verified user ID. Password reset never removes MFA. Integrated enforcement and acceptance remain pending. |
| B13 | Loyalty claim, expiry and shutdown policy                             | VLP-072, VLP-073, VLP-074                            | T6.5             | Set retroactive claim window, FEFO restore/expired/spent-earn handling, notice/grace periods and unresolved points at permanent closure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| B14 | PARTIAL: saved-cart retention selected                                | VLP-078, VLP-079, VLP-080                            | T3.2, T3.7, T6.4 | PARTIAL (2026-11-25): guest draft 24h, member 7d after last edit; reads/replays never extend. Drafts stay separate; sign-in never imports guest draft. D06 revision rules. Quota/payment hold and allocation remain open. Unknown payment must retain reservations.                                                                                                                                                                                                                                                                                                                                        |
| B15 | Reminders, delay and No-Show policy                                   | VLP-085, VLP-086                                     | T3.4, T3.5, T6.6 | Set pickup reminder cadence, No-Show evidence and delay/ETA notification timing. No automatic refund or fabricated handover is allowed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| B16 | RESOLVED: menu import contract                                        | VLP-092                                              | T3.9             | RESOLVED 2026-11-25: D03 v1 template approved (CSV/XLSX one table, 5 MiB, 2,000 rows, 20 MiB XLSX, no formulas, preview then all-or-nothing apply). Existing entities bind by a durable Owner-defined `ref` per restaurant and row kind; needs an additive migration. T3.9 implements.                                                                                                                                                                                                                                                                                                                     |

### 6.1 Policy decisions recorded 2026-11-26

The user approved Main's written proposals with "ใช้ตามข้อเสนอ" on 2026-11-26.
Only values Main actually proposed are approved. Values marked "still open"
were not proposed and remain blockers. These supersede the matching "TBD" text
in the table above; the table rows are kept unchanged as history.

| ID  | Approved values                                                                                                                                                                                                                                                                                                        | Still open                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| B03 | Payment QR lifetime 15 minutes. Query the provider before any unlock/expiry; an unknown result stays CHECKING and keeps holds. Reconciliation query every 1 minute for the first 30 minutes after creation, then every 15 minutes. A payment confirmed more than 24 hours late goes to the manual refund review queue. | Provider-specific limits once B02 is chosen.                                                |
| B04 | Equal verified paid time: order by local confirmation-received time, then order ID. A late callback for an earlier payment may be inserted by paid time only ahead of orders the kitchen has not started; it never displaces started work. ETA = restaurant average preparation time × orders ahead.                   | How "average preparation time" is measured and its fallback when there is no history.       |
| B05 | Pro adds advanced reports and storefront customization. Expiry notices 7 days and 1 day before expiry.                                                                                                                                                                                                                 | Monthly and yearly prices.                                                                  |
| B06 | Repeated clicks from the same viewer within 24 hours count once. Conversion attribution window: 7 days after click.                                                                                                                                                                                                    | Fixed/CPC/CPM rates, impression validity, fraud thresholds, unused-credit refund procedure. |
| B09 | Partial refunds allocate order-level discounts proportionally by each line's pre-discount value, rounded to satang, with the remainder on the last line.                                                                                                                                                               | Merchant promotion rates, quotas, eligibility and expiry.                                   |
| B10 | Individual: national ID plus a bank-book page in the same name. Juristic: company certificate, director ID and an account in the company name. Admin reviews manually; no paid e-KYC.                                                                                                                                  | Transfer, appeal/reapproval and closure checks.                                             |
| B11 | Partially mask phone numbers in exports. Download links expire after 24 hours.                                                                                                                                                                                                                                         | Per-dataset format mapping and job limits.                                                  |
| B12 | Manual recovery option 2: unavailable for every role for now. Revisit option 1 after B10 records exist.                                                                                                                                                                                                                | —                                                                                           |
| B13 | Retroactive points claim window 30 days after the order. A refund after points were spent reverses them; any shortfall becomes a negative balance owed.                                                                                                                                                                | Points expiry duration, FEFO restore detail, closure notice/grace periods.                  |
| B15 | Pickup reminder when the order is Ready, again after 10 minutes. No-Show only after 30 minutes Ready and two sent reminders; never auto-refund. Notify when ETA slips by more than 10 minutes.                                                                                                                         | Delivery channel/provider (Web Push needs no provider).                                     |
| B16 | Initial `ref` binding: the system exports the current menu as a v1 template with generated starting refs; the Owner may edit them, then confirms the binding. Preview retention: 30 minutes.                                                                                                                           | —                                                                                           |

B09 clarification, user decision 2026-11-26 after independent review: a
refund uses the per-line discount stored at sale time, so it always matches
what the customer paid. The B09 formula applies only when no stored per-line
discount exists. Approved extension: if the last line is smaller than the
remainder, the excess moves to earlier lines so no line's discount exceeds
its own value.

Unchanged blockers: B02 provider selection and merchant onboarding (needs the
user's application with a bank), B07 retention/legal durations (needs legal
review), B08 RPO/RTO, drill cadence, alerting and budget, and B05/B06 prices.

## 7. T0.1 reassessment and next boundary

T0.1's missing-register blocker is resolved. The source is present, all 92 exact
statements/selections are reconciled, and every item maps to current evidence,
a design section and at least one defined future task. T0.1 is PASS for this
documentation/import gate after the document consistency checks recorded in
tasks.md. This does not assert that all 92 features are implemented or accepted.

T0.2 remains BLOCKED on B02-B16 as applicable; B01 mapping is approved, with
compatibility/data proof still pending in its dependent tasks. T0.3 has a current static HEAD,
route count and schema-required-version baseline, but no database/runtime or
retained-data acceptance. Future implementation needs a selected bounded task,
resolved dependent inputs, scope authorization, applicable TDD/checks and required
independent review. No agent dispatch or implementation is authorized by this
reconciliation. Rollback for these edits is a scoped review of the three spec
file diffs; no data migration/recovery is involved.
