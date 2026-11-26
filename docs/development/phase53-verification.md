# Phase 5.3 — Pricing & Promotions: Local Verification

วันที่ตรวจ: **2026-10-10, Asia/Bangkok** ต่อจากแชท `01a125e5-d0fd-7760-a6ed-2dca8ff25f15`

สถานะ: **Phase5.3.1–5.3.5 และ Phase5.3 overall COMPLETED (Local)**. Phase0–4 และ5.1–5.3 COMPLETED (Local); **Phase5 overall PARTIAL**, 5.4–5.6 NOT STARTED, 5.7 PARTIAL, **Phase6 NOT STARTED / NOT READY**. ไม่ใช่ production release หรือการอนุญาต deploy

## ขอบเขตและไฟล์

- `apps/api/internal/modules/pricing/`: exact-money engine, price lists, typed promotion rules, precedence/rounding, approval lifecycle, authorization, audit และ redemption ใน authorized PostgreSQL transaction เดิม
- `apps/api/internal/modules/pos/`: quote/cart/hold/checkout, durable funds reconciliation, Sale/receipt snapshots และ current replacement pricing สำหรับ Exchanges; ไม่มี checkout หรือ stock engine ชุดที่สอง
- `apps/api/internal/modules/organization/pricing_policy.go`, `policy.go`, `transport/router.go`: permissions และ tenant-scoped routes; `platform/database/database.go`: readiness schema10
- `database/migrations/000010_pricing_promotions.up.sql`: forward-only schema พร้อม guards, tenant references, immutable allocations, FORCE RLS และ runtime grants; migrations1–9 ไม่เปลี่ยน
- `apps/web/src/features/pricing/`, `lib/pricing-api.ts`, router/navigation และ POS/Sales/Receipt: UI จริงบน shared Golden Amber components และ TH/EN patterns เดิม ไม่มี mock business data
- `packages/contracts/openapi.yaml`, `scripts/check-contracts.mjs`:16 API paths ใหม่และ additive POS quote/snapshot/NONE fields; canonical inventory ยังคง **16 modules /106 planned routes**
- `tests/integration/pricing-{flow,safety}.mjs`, `pricing-reconciliation.sql`, `tests/e2e/pricing.spec.ts`, `Receipt.test.tsx` และ `scripts/check-phase53*.mjs`: acceptance/retry/concurrency/financial/UI coverage; SQL schema guards เดิมปรับ9→10เท่านั้น ไม่ลบ assertions
- README, TODO เดิม, architecture, security-model และ verification index อัปเดตขอบเขตปัจจุบัน; รายงาน Phase5.1/5.2 เดิมเก็บไว้เป็นประวัติ

## การตัดสินใจด้าน architecture / DB / API

1. ACTIVE branch list มาก่อน organization list; ภายใน scope เรียง priority มากไปน้อยและ UUID น้อยไปมาก; ไม่มีรายการที่ใช้ได้จึง fallback Catalog. Starts inclusive/ends exclusive; lifecycle `DRAFT → PENDING_APPROVAL → APPROVED → ACTIVE ↔ PAUSED` ตรวจ optimistic revision และ audit
2. PERCENTAGE/FIXED/BOGO/MINIMUM_SPEND เป็น typed JSON ที่ server ตรวจ ไม่ใช่ executable expressions. STACKABLE ทำตาม priority/UUID กับยอดคงเหลือ; เปรียบเทียบทั้ง stack กับ single EXCLUSIVE/BEST_DISCOUNT_ONLY ที่ดีที่สุด เลือกส่วนลดมากกว่าและคง stack เมื่อเสมอ
3. เงินคำนวณเป็น integer cents / big-integer intermediates; largest-remainder allocation มี stable variant UUID tie-break. BOGO ใช้ whole units และลด stock ทุกชิ้นรวมของฟรี; fractional units ไม่เพิ่ม BOGO groups
4. `price_lists`, `promotions`, `discount_approvals`, `promotion_redemptions` ใช้ tenant-safe references และ ENABLE/FORCE RLS. Runtime ไม่มี DELETE และแก้ redemption history ไม่ได้. Sale/items/consumed approval immutable; deferred guards reconcile allocations/usage
5. Approval ผูก requester/tenant/branch/cart revision/base pricing revision หมดอายุ15นาที; recheck อำนาจปัจจุบันของ approver ก่อนใช้และ sensitive cached replay. Cashier ขอได้เฉพาะ cart ตนเอง; Owner/Manager อนุมัติตาม scope; Manager จัดการ organization-wide definitions ไม่ได้
6. POS prepare→acknowledge→complete ใช้ quote service เดียวกันและ revalidate. เปลี่ยนราคาหลังรับเงินจริงต้องไม่ silently reprice: rollback business posting และเก็บ RECONCILIATION_REQUIRED evidence. Duplicate completion ไม่เพิ่ม Sale/payment/usage/stock ซ้ำ
7. **Zero-payable ไม่สร้างเงินรับปลอม**: ใช้ internal NONE settlement snapshot หนึ่งแถวตาม existing one-settlement-per-Sale contract โดย amount/received/change/credit_amount เป็น0ทั้งหมด ไม่มี CASH/bank receipt, provider acknowledgement หรือ funds-confirm UI. ไม่มี cash_sales เพิ่ม
8. Refund/Exchange credit ใช้ historical net-paid `sale_items.line_total`; replacement ใช้ current pricing. ทดสอบ original225.00 คืนบางส่วน75.00 และ exchange credit75.00 กับ current replacement gross100.00−discount10.00=net90.00: รับ CASH เฉพาะส่วนต่าง15.00, consume promotion/stock ครั้งเดียว และไม่แก้ original Sale
9. Sale, approval consumption, redemptions และ Inventory commit atomically; final-use locks/organization serialization กัน usage เกิน limit. Failed posting ไม่ consume usage. Refund/reversal ไม่คืน promotion quota: usage หมายถึง committed redemptions
10. API fields เป็น additive; clients เดิมที่ไม่ส่ง pricing_revision ยังใช้ได้ แต่ server ตรวจยอด/สิทธิ์จากข้อมูลจริง. Internal NONE และ EXCHANGE_CREDIT ไม่ใช่ tender selector ทั่วไป. ไม่มีการเปลี่ยน tax engine, loyalty, external payment gateway หรือเริ่ม5.4+

รายละเอียด: [Pricing architecture](../architecture/pricing.md)

## Frontend routes และหลักฐานภาพ

| Route                 | Read gate       | งานจริง                                 |
| --------------------- | --------------- | --------------------------------------- |
| `/pricing`            | pricing.read    | ภาพรวมและ navigation                    |
| `/pricing/lists`      | pricing.read    | สร้าง/แก้ Draft และ lifecycle ตามสิทธิ์ |
| `/promotions`         | promotions.read | รายการและสร้าง typed promotion          |
| `/promotions/:id`     | promotions.read | โหลดรายละเอียดจริงและ lifecycle         |
| `/discount-approvals` | discount.read   | คำขอ/approve/reject/status ตามสิทธิ์    |

Mutation permissions/tenant/branch ถูกตรวจซ้ำที่ API ไม่พึ่ง client gate อย่างเดียว. Playwright ทดสอบ list/promotion create→submit→approve→activate, request→approve manual discount, exact checkout/receipt และ zero-payable ผ่าน real gateway. ตรวจทั้ง5 routes ที่360,390,768,1024,1280,1440,1920px โดย assertions ไม่มี horizontal overflow

ภาพเก็บใต้ `test-results/pricing-*/`: `pricing-route-{0..4}-{360|1440}.png` และ `zero-payable-mobile.png`. เปิดดูจริง: price lists1440, promotion detail360, promotions1440, approval queue360 และ zero-payable360; ไม่พบ clipping/overflow ของเนื้อหาที่ตรวจ ไม่ได้อ้างว่า visual-inspect ทุก35 combinations หรือผ่าน hardware/accessibility certification

## Environment และคำสั่งที่ใช้จริง

ใช้ Docker project **smartpos-auth-test**, gateway `http://localhost:18088`, API18080/web15173 และ scratch database ที่อ่านจาก `.local/phase53-database.json`. ไม่ย้าย/migrate primary DB และไม่ลบ scratch DB/volumes. Migration validation ที่ไม่มี `--start` ไม่เปลี่ยน active gateway metadata

```powershell
node scripts/check-phase53-migrations.mjs --start
$env:AUTH_TEST_DATABASE=(Get-Content .local/phase53-database.json|ConvertFrom-Json).database
node scripts/check-phase53.mjs
node scripts/check-auth.mjs tests/e2e/pricing.spec.ts --workers=1
docker compose -p smartpos-auth-test --profile checks run --build --rm api-check
docker compose -p smartpos-auth-test --profile checks run --build --rm ai-check
npm run typecheck
npm run lint
npm test
npm run build
node scripts/check-phase53-migrations.mjs
npm run format:check
git diff --check
```

Compose/Caddy/smoke ใช้ project และ scratch target ชัดเจน:

```powershell
$env:POSTGRES_DB=(Get-Content .local/phase53-database.json|ConvertFrom-Json).database
$env:POSTGRES_PORT='15432'; $env:API_PORT='18080'; $env:WEB_PORT='15173'
$env:GATEWAY_PORT='18088'; $env:MAILPIT_PORT='18025'; $env:PUBLIC_ORIGIN='http://localhost:18088'
docker compose -p smartpos-auth-test config --quiet
docker compose -p smartpos-auth-test exec -T caddy caddy validate --config /etc/caddy/Caddyfile
docker compose -p smartpos-auth-test --profile checks run --no-deps --rm integration-check
Get-Content tests/integration/pricing-reconciliation.sql -Raw | docker compose -p smartpos-auth-test exec -T postgres psql -U smartpos_dev -d $env:POSTGRES_DB -v ON_ERROR_STOP=1
```

## ผล checks

| Check                           | ผลล่าสุด         | หลักฐาน / ข้อจำกัด                                                                                                                     |
| ------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Go format/vet/race/tests/build  | PASSED           | CGO-enabled api-check; `.local/phase53-go-check.log`; ไม่อ้างจำนวน Go tests ที่ไม่ได้เก็บ                                              |
| Frontend typecheck              | PASSED           | `.local/phase53-web-check.log`                                                                                                         |
| ESLint                          | PASSED, warnings | 0 errors /3 existing Fast Refresh warnings                                                                                             |
| Frontend Vitest                 | PASSED           | **18 files /96 tests**                                                                                                                 |
| OpenAPI/contracts               | PASSED           | 16 modules/106 unique planned routes, pricing16 paths และ POS schemas                                                                  |
| Web production build            | PASSED, warning  | `.local/phase53-web-build.log`; existing chunk >500KB                                                                                  |
| AI check                        | PASSED, warning  | **7 pytest tests**, Ruff/format/import; existing Starlette deprecation                                                                 |
| Fresh migration chain           | PASSED           | versions1–10ทีละversion, clean tracker, rerun no change; `.local/phase53-migrations-final.log`                                         |
| Existing SQL suites             | PASSED           | 7 rollback-only suites: foundation/identity/organization/catalog/inventory/returns/adjustments                                         |
| Pricing RLS/grants              | PASSED           | 4 tables FORCE RLS, runtime grants/no-context denial, tenant references and immutable/usage guards                                     |
| API regression                  | PASSED           | 16 suites, **1,699 numbered assertions** รวม319ใหม่; auth/organization ไม่มี assertion counter                                         |
| Standalone pricing browser      | PASSED           | **2/2 tests**, `.local/phase53-pricing-e2e.log`                                                                                        |
| Full browser regression         | PASSED           | **23/23 tests** ผ่าน real gateway; `.local/phase53-browser.log`, runner17/17 suites PASSED                                             |
| Compose/Caddy/smoke             | PASSED           | schema/constraints/service health/system/dashboard/private-AI404; `.local/phase53-smoke.log`                                           |
| Global read-only reconciliation | PASSED           | 8 checks,0 violations;104 Sales/112 lines/414 stock movements/18 redemptions หลัง full regression; `.local/phase53-reconciliation.log` |
| Format/diff                     | PASSED           | `npm run format:check`, `git diff --check`; prior migrationsทุก tracked file byte-identical to HEAD และ lockfileไม่เปลี่ยน             |

API numbered assertions แยกตาม suite: catalog116, inventory135, POS132+64, purchasing/shelves175+125, Returns111+96+42, Exchanges/Voids163+135+86, Pricing280+39. รวม **1,699 assertions ไม่ใช่1,699 independent test cases**. Auth/organization suites ผ่านแต่ไม่มีจำนวน assertions; ไม่แต่งตัวเลขเพิ่ม. `phase53-regression-results.json` และ per-suite logs ใต้ `.local` เป็นหลักฐาน run ล่าสุด

## Mandatory behavior coverage

- Precedence/effective windows/revisions, ทั้ง4 promotion types, eligibility/stacking/best/exclusive และ exact rounding: unit/API assertions
- Concurrent final redemption, failed all-item posting/usage rollback, duplicate checkout/retry และ immutable Sale/redemption/approval: API/DB safety tests
- Stale/expired/forged/revoked approval, own-cart/tenant/branch/RBAC/CSRF/Origin และ runtime RLS: flow+safety suites
- Held-cart revalidation, price changesก่อน/หลัง acknowledgement และ durable reconciliation: pricing-flow และ existing POS safety
- BOGO physical stock, zero-payableไม่มี financial money, historical partial refund และ completed discounted exchange: pricing-flow พร้อม exact money/stock/replay assertions
- Phase0–5.2 regression: original suitesทั้ง16 APIรวม pricing, SQLทั้ง7, frontend/Go/AI และ full browser gateที่ระบุผลแยก

## Failed attempts / การแก้ไข

- Receipt unit fixture ขาด subtotal/discount_total หลัง contract เพิ่ม: เติม fixture ให้ตรง schema และเพิ่ม discounted historical/zero-payable assertions โดยคง testsเดิม
- Playwright selector ของ wrapped label/select: ใช้ accessible combobox role แทน labelที่มี option text; rerun standaloneผ่าน2/2
- Zero-payable test เดิมคาดว่าไม่มี settlement row: แก้ assertion ให้ตรง existing one-settlement contract คือ NONE0ทั้งหมด พร้อมยืนยันไม่มี non-NONE/nonzero financial money; ไม่เปลี่ยนให้รับเงินปลอม
- Go formatพบ inherited unformatted approvals/exchanges: gofmtแล้ว container format/vet/race/buildผ่าน
- Sandbox ปฏิเสธ Docker pipe/cache writes/patch process: ขอ scoped escalation ตามระบบ ไม่เปลี่ยน execution policy. Web commandชุดล่าสุดหมดเวลาระหว่าง buildหลัง typecheck/lint/tests/contractsผ่าน; rerun buildแยกจบและผ่าน ไม่นับ timeoutว่า pass
- ตรวจเอกสารพบคำกล่าวว่า definition lists bounded200ไม่ตรง code: แก้ให้ระบุ approval queue200และ definition lists unpaginated ตามจริง
- เพิ่ม completed discounted exchange coverageอีก30 assertionsจากเดิม250→280 เพื่อไม่อ้าง completeจาก quote-only evidence; latest pricing-flowผ่าน280

## ข้อจำกัดและ phase exit

ยังไม่ทดสอบ production load, external gateway/bank confirmation, physical printers/scanners, full accessibility, legal/tax certification, dedicated runtime LOGIN, TLS/secrets และ approved primary migration/backup/restore. `scripts/check-resilience.mjs` แบบเดิมชี้ default project จึง **NOT RUN** เพื่อไม่รบกวน primary; isolated auth regressionครอบคลุม SMTP outageและ recovery แต่ไม่อ้าง full production failover

Approval queues bounded200และ definition listsไม่มี pagination. Promotion quotaไม่คืนจากrefund/reversal. Existing warnings3 ESLint, bundle size และ Starlette ไม่ได้แก้ unrelated scope. การผ่าน local gatesไม่ใช่ production readiness

Phase5.3.1–5.3.5 และ overall **COMPLETED (Local)**: mandatory local acceptance gatesผ่านจริง รวม full browser23/23, read-only reconciliation8 checks/0 violations และ final format/diff checks. พร้อมเป็น prerequisiteให้วางแผน Phase5.4 โดยยังไม่เริ่ม implementation5.4. **Phase5 overallยัง PARTIAL และ Phase6ยัง NOT STARTED / NOT READY**

ไม่ได้ stage/commit/สร้างbranch/reset/push/deploy, ติดตั้ง dependencies, ลบข้อมูล/volumes, แก้ migrations1–9 หรือเริ่ม Phase5.4–5.6/6; รักษา uncommittedงานเดิมและใช้ Main agentเพียงคนเดียว
