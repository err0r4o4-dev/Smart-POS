# Phase 5 — Business Operations: local verification

วันที่ตรวจ: **2026-10-10, Asia/Bangkok** รายงาน working tree ที่ยังไม่ commit ไม่ใช่ production certification

## 1. สถานะและขอบเขตจริง

| ขอบเขต                         | สถานะ                             | หลักฐาน/งานที่เหลือ                                                                                                   |
| ------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Phase 0–4                      | COMPLETED (Local)                 | หลักฐานเดิมเก็บไว้; regression บน schema8 ผ่าน                                                                        |
| 5.1 Returns & Refunds          | COMPLETED (Local), scoped         | Backend/frontend/PostgreSQL จริง; 247 API assertions, browser/SQL ผ่าน; manual payment/batch limitations ระบุด้านล่าง |
| 5.2 Exchanges & Voids          | PARTIAL — ยังไม่มี implementation | ไม่มี durable exchange/difference settlement หรือ completed-sale void                                                 |
| 5.3 Pricing & Promotions       | PARTIAL — ยังไม่มี implementation | ไม่มี price lists/rules/allocations/usage limits/approval                                                             |
| 5.4 Customer Management        | PARTIAL — ยังไม่มี implementation | ไม่มี customer/groups/privacy lifecycle/sale linkage                                                                  |
| 5.5 Loyalty & Rewards          | PARTIAL — ยังไม่มี implementation | ไม่มี points ledger/earning/redemption/refund reversal                                                                |
| 5.6 Expiry & Quality           | PARTIAL — ยังไม่มี implementation | ไม่มี batches/untracked allocation/FEFO/expiry/write-offs/recalls                                                     |
| 5.7 Integration, Security & QA | PARTIAL                           | Returns และ Phase 0–4 ผ่าน; gates ของ missing features ยังไม่รัน                                                      |
| Phase 5 overall                | **PARTIAL**                       | คำขอ full implementation ยังไม่ครบ; ห้ามใช้ 5.1 เป็น acceptance ทั้ง Phase                                            |
| Phase 6 / 7                    | NOT STARTED                       | Phase6 NOT READY; ไม่มี deploy/production release                                                                     |

Attachment เป็นคำขอ Phase5 implementation แทนที่ Phase4 verification ก่อนหน้า รับช่วง working tree ที่ทำ 5.1 ไว้แล้ว ไม่ reset หรือเขียน Phase0–4 ใหม่ Canonical 16 modules / 106 planned routes คงเดิม Newly operational routes มีเพียง `/pos/returns`, `/sales/refunds`

## 2. Environment จริง

| รายการ           | ผลที่ตรวจ                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Host             | Windows/PowerShell, Node24.21.0, npm11.19.0                                                                           |
| Docker daemon    | Engine29.8.2; sandbox รอบแรกเข้าถึง named pipe ไม่ได้ ใช้ approved escalation แล้วสำเร็จ ไม่ถือว่า daemon unavailable |
| Compose          | v5.5.1                                                                                                                |
| Isolated project | `smartpos-auth-test`: postgres/api/web/caddy/mailpit/ai healthy                                                       |
| Gateway          | `http://localhost:18088`, Caddy2.10.2                                                                                 |
| PostgreSQL       | 17.11; host loopback15432; test DB `smartpos`                                                                         |
| Go host          | 1.27.2 windows/amd64, CGO_ENABLED=0; ไม่เปลี่ยน host config                                                           |
| Go check image   | 1.26.9 linux/amd64, CGO_ENABLED=1, GCC15.2.0; race ผ่าน                                                               |
| Playwright       | 1.64.0; Chromium launch และ real-enabled suite ผ่าน                                                                   |

Rebuild เฉพาะ web/api ของ test project ด้วย explicit port/origin overrides ไม่ใช้ bare stack:up ใน primary environment Both `smartpos-auth-test_postgres-data` และ `smartpos_postgres-data` ยังคงอยู่ ไม่ลบ database/volume ไม่ migrate primary development DB ไม่เปิด external payout API

## 3. Migration และฐานข้อมูล

`000008_business_operations.up.sql` มี **Returns/Refunds เท่านั้น**: customer_returns, customer_return_items, customer_refunds, refund_settlement_events, register_cash_disbursements; SALE_RETURN/customer_return_item_id, cash_refunds, tenant-safe FKs/indexes/FORCE RLS/restricted runtime grants/immutable evidence/deferred accounting Readiness ต้อง exact clean8

Fresh retained scratch ล่าสุด **`smartpos_phase5_acceptance_20261010_c40fedb1`** ภายใน test PostgreSQL เริ่มด้วย public tables=0 Official migrate runner `up 1` ตามลำดับ **1→2→3→4→5→6→7→8** แต่ละ version dirty=false; rerun **no change** ไม่มีการแก้ migrations1–7

หก rollback-only SQL suites (`foundation`, `identity`, `organization`, `catalog`, `inventory`, `returns`) ผ่านบน fresh scratch Updated auth-integration-check ตรวจ identity/organization/catalog/inventory/returns ผ่านบน isolated smartpos ไม่มี SQL fixture commit

ระหว่าง scratch verification isolated smartpos tracker/counts ไม่เปลี่ยน: **8|false, users511, organizations250, sales155** เป็น checksum ป้องกัน scratch migration เปลี่ยน existing test DB ไม่ใช่ assertion count API/browser suites สร้าง synthetic data ตาม pattern เดิมแล้วคงไว้ ไม่มี cleanup ล้างข้อมูล Phase4 scratch และ Phase5 scratch ก่อนหน้า รวม `smartpos_phase5_acceptance_20261010_71dd2815` คงไว้

Final global ledger/balance reconciliation: **0 mismatches** Runtime non-superuser/non-BYPASSRLS, five-table FORCE RLS, missing/cross-tenant context yields0, immutable write denial และ deferred checks ผ่าน

Migration8 ใช้ไปแล้ว ห้าม append features แล้วอ้าง rerun จะเพิ่ม schema ต้อง follow-up forward migration พร้อม readiness/acceptance ที่ตรงกัน ยังไม่ทำ schema ของ5.2–5.6

## 4. Implementation ที่ยืนยันได้

- Original sale/items/payment/receipt และ original ledger ไม่แก้ คำนวณ historical cumulative-floor allocation ด้วย big integers ไม่ใช้ current catalog price; fractional remainder ผ่าน
- Draft→pending approval→approved→completed พร้อม reject/cancel; completion atomically commits Inventory/pending refund/audit/idempotent result
- RESTOCK_SELLABLE/QUARANTINE/DAMAGED/NO_STOCK_RETURN ตรวจ destination/type/branch/unit precision; no-stock ไม่เพิ่ม stock
- Separate reported/confirmed/reconciliation events; manual bank/original-method ไม่อ้าง bank verification ไม่ auto payout/retry
- Cash ใช้ current actor-owned open shift, unresolved close gate และ once-only disbursement; original closed shift ไม่เปลี่ยน
- Authorization ก่อน replay; Cashier own documents ไม่ approve/settle; demoted/suspended/revoked/wrong-branch/cross-tenant denied
- Thai/English UI, tenant/user/branch/resource-scoped cache/workspace, stale mutation abort, same-key ambiguous retry, loading/empty/error/retry/pagination/print

## 5. API / concurrency / security results

| Command                                                                                 | ผลจริง                  | Coverage                                                                                                                                                       |
| --------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node tests/integration/returns-flow.mjs`                                               | PASS **111 assertions** | Eligibility/historical money, four dispositions, manual/cash, duplicate settlement, concurrent last-unit return, RBAC/branch/tenant/CSRF/Origin                |
| `node tests/integration/returns-safety.mjs`                                             | PASS **94 assertions**  | Immutable originals, old/new shift, reconciliation-close gate, all-item rollback/retry, fractional0.00/0.01/0.01, permission-change replay, runtime RLS/grants |
| `node tests/integration/returns-shelves.mjs`                                            | PASS **42 assertions**  | Concurrent capacity, no orphan movement/refund/key, inactive/unassigned shelf, same-key recovery, stock conservation                                           |
| `npm run verify:returns`                                                                | PASS **247 total**      | สามชุดจริงหลังแก้ capacity; helper fixture assertions ไม่บวกใน counters                                                                                        |
| `docker compose -p smartpos-auth-test --profile checks run --rm auth-integration-check` | PASS                    | Five rollback-only SQL files; RLS/grants/accounting                                                                                                            |

### พบและแก้จริง

1. **Shelf capacity:** regression ก่อนแก้ได้ completions2 แทน1 (`2 !== 1`) ทำ stock เกิน capacity แก้ `inventory.PostCustomerReturn`: registered shelf/assignment ต้อง ACTIVE และตรง variant; recorded+return≤capacity ภายใต้ existing organization lock ไม่เพิ่ม stock engine หลัง rebuild ทั้ง247 assertions ผ่าน
2. **cash_refunds JSON:** shift list เคย serialize NUMERIC เป็น number แต่ detail string แก้ `cash_refunds::text`; safety ตรวจ '2.00', POS132+64 ผ่าน
3. **Browser failures ระหว่างพัฒนา:** stale web image และ native-select locator เคย fail; rebuild และ exact accessible combobox locator ไม่ bypass security
4. **Print:** visibility-only CSS เคยเหลือ hidden layout แก้ซ่อน non-document/non-ancestor layouts; rebuild แล้ว focused/full E2E ผ่าน ตรวจภาพล่าสุดจริง

ไม่ disable RLS/bypass RBAC/CSRF/skip-delete tests/mock Returns APIs Security เป็น scoped implementation review ไม่ใช่ penetration test Customer privacy/loyalty double-spend/recall races **ยังไม่ทดสอบ** เพราะไม่มี features

## 6. Browser / visual

`node scripts/check-auth.mjs` ล่าสุด **19/19 Playwright PASS**: real-enabled auth/organization/catalog/inventory/POS/purchasing/returns ผ่าน actual Caddy/backend/isolated PostgreSQL ไม่มี mocked Returns business responses Foundation readiness UI tests มี controlled readiness states ตาม suite เดิม ไม่ใช้เป็น financial integration evidence

Focused `AUTH_E2E=1 E2E_BASE_URL=http://localhost:18088 npx playwright test tests/e2e/returns.spec.ts` **1/1 PASS** หลัง rebuild print CSS; full19/19 รันตามหลังอีกครั้ง Counts เป็น executed tests ไม่ใช่จำนวน scenarios

Returns browser: original sale→partial return→submit/approve→post→manual report→confirm→exact API replay พร้อม remaining quantity/events สอง routes ที่ **320/375/640/768/1024/1440/1920px** ไม่ page overflow Six route screenshots + print อยู่ ignored `test-results/returns-Phase-5-1-real-par-19d34-replay-and-responsive-pages/`

Mobile320/desktop refunds/print inspected ตัวเลข/actor/time/evidence อ่านได้ ตาราง scroll เฉพาะ region Print ซ่อน navigation/buttons และไม่เหลือ sidebar layout เป็น acknowledgement ไม่ใช่ tax/bank certificate Physical printer/full accessibility ยังไม่ตรวจ Trace อาจมี session headers: ไม่ dump/commit

## 7. Frontend / Go / contracts / build

| Command                                                                                | ผล                                                                                          |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm test`                                                                             | PASS **91/91 tests**, 17 files; contracts ผ่าน                                              |
| `npm run contracts:check`                                                              | PASS canonical16 modules/106 routes; explicit API/idempotency/security contracts            |
| `npm run typecheck`                                                                    | PASS                                                                                        |
| `npm run lint`                                                                         | PASS **0 errors / 3 existing Fast Refresh warnings**                                        |
| `npm run build`                                                                        | PASS; JS~592.28kB, existing >500kB warning คงไว้                                            |
| `docker compose -p smartpos-auth-test --profile checks run --build --rm api-check`     | PASS format inspection, `go vet ./...`, `go test -race ./...`, `go build ./cmd/server`      |
| `docker compose -p smartpos-auth-test up --build -d --wait --wait-timeout 180 web api` | PASS current images healthy; explicit test environment overrides                            |
| `docker compose -p smartpos-auth-test --profile checks run --build --rm ai-check`      | PASS lint/format/import, **7/7 health tests**; existing Starlette/httpx deprecation warning |

Race ใช้ CGO-enabled image ตาม repository ไม่อ้าง hostCGO0 เป็น pass ไม่ตั้ง global environment/install toolchain ใหม่

Focused Prettier checks ของ Phase5 source/contracts/tests ผ่าน เอกสาร report หลังเพิ่ม changed-path inventory ยังมี whitespace-format warning จาก helper ที่ใช้ context-free hunks; ไม่อ้าง final report formatting PASS ไม่มีการ format ทั้ง repository หรือแก้ unrelated files `git diff --check` ตรวจแยกจาก Prettier

## 8. Phase 0–4 regression ล่าสุด

| Command                                                                            | ผล                                                                                                |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `node tests/integration/auth-flow.mjs`                                             | PASS lifecycle/reset/revocation/replay/expiry, rate limits/spoofing, safe SMTP outage/restoration |
| `npm run verify:organization`                                                      | PASS onboarding/idempotency/branch/RBAC/invitations/revocation/last-owner/audit                   |
| `npm run verify:catalog`                                                           | PASS **116 assertions**                                                                           |
| `npm run verify:inventory`                                                         | PASS **135 assertions**                                                                           |
| `npm run verify:pos`                                                               | PASS **132 flow + 64 safety**                                                                     |
| `npm run verify:purchasing`                                                        | PASS **175 flow + 125 safety**, includes Shelves                                                  |
| `docker compose -p smartpos-auth-test --profile checks run --rm integration-check` | PASS foundation SQL/RLS/health/readiness/AI communication/gateway; expected negative404 retained  |
| `node scripts/check-auth.mjs`                                                      | PASS full **19 tests** including Phase0–4/Returns                                                 |

Chained regression ครั้งหนึ่ง timeout304seconds ไม่ใช้เป็น pass และไม่เดาชุดที่ผ่าน ตรวจ stack healthy/DB waits ไม่มี stuck transaction แล้วรันทุกชุดแยกและได้ PASS จริง Mailpit restored Prior implementation summary เป็น prior evidence; latest PASS ด้านบนรันใหม่แล้ว

## 9. ข้อจำกัด / งานที่ยังต้องทำ

- **Full Phase5 ยังไม่ครบ:** 5.2–5.6 ไม่มี backend/frontend/schema/acceptance ไม่ใช่ Docker blocker
- Exchange ต้อง share POS settlement boundary/constraints พร้อม durable linkage/net tender/refund ห้าม unrelated full checkout แล้วเรียก exchange Completed-sale void ต้อง auditable full reversal; ห้ามแก้/delete original sale Existing uncommitted checkout cancellation ไม่ใช่ completed-sale void
- POS ยัง zero-discount/full-consideration ต้อง historical allocation/usage-locking ก่อน pricing/loyalty ไม่มี customer privacy/points feature ให้ certify
- 5.6 ต้อง tracked+explicitly untracked=aggregate บน receiving/transfer/count/adjustment/sale/return ทุก path ไม่มี batch provenance หรือ auto expired/recalled-item guard ใน5.1 เลือก inspection disposition อย่างซื่อสัตย์
- Cash confirmer ต้อง own selected shift ไม่มี reassignment หาก reporter unavailable ห้าม DB bypass/fake settlement เพื่อ close
- Draft lines/quotes immutable ต้อง cancel/recreate เมื่อเปลี่ยน inspection/stale allocation; no draft reservation
- Shelf guard เป็น return-path policy ไม่ universal DB capacity invariant ทุก legacy Inventory correction ไม่วัด physical space
- Manual evidence ไม่ verified payment/PostgreSQL ไม่ครอบ external payout Print acknowledgement เท่านั้น
- Production gates: dedicated runtimeLOGIN แยก bootstrap, TLS/secrets/SMTP, backup AND restore/rollout, load/lock contention, retention/privacy, hardware/full accessibility ยังไม่ผ่าน

## 10. Paths / handoff

Backend: `apps/api/internal/modules/returns/`, `inventory/customer_returns.go`, `organization/returns_policy*.go`, policy/router, POS shifts/queries/database readiness Frontend: `features/returns/`, `lib/returns-api*.ts`, `styles/returns.css`, route/main/POS/shift wiring

Database/contracts/tests: migration8/OpenAPI/exact contract checker/package verify command, `tests/integration/returns-{fixtures,flow,safety,shelves}.mjs`, `returns.sql`, `tests/e2e/returns.spec.ts`; five old SQL guards now exact clean8 without reducing assertions

Docs: README/TODO/current verification/roadmap/overview/modules/routes/security/database overview, Returns/refund flows and Business Operations architecture/schema/report Phase0–4 evidence preserved No documents claim nonexistent features

ไม่มี reset/stage/commit/branch/push/deploy/Phase6 Stackเดิมและ volumes คงไว้ทำต่อ Test clients ของ suites ปิดใน finally ไม่ลบ container/process เดิมที่ไม่ทราบเจ้าของ

**Final: Phase5 PARTIAL; scoped5.1 COMPLETED (Local); Phase6 NOT READY / NOT STARTED.** ถัดไป5.2 durable Exchanges/Voids ก่อน pricing/customers/loyalty/qualityตามลำดับ ไม่ใช่ AI


## 11. Complete changed-path inventory

Working tree snapshot: 59 paths; no staged changes are included by this work. Paths are implementation plus documentation and tests, not a claim that all Phase 5 features exist.

- `README.md`
- `TODO.md`
- `apps/api/internal/modules/inventory/customer_returns.go`
- `apps/api/internal/modules/organization/policy.go`
- `apps/api/internal/modules/organization/returns_policy.go`
- `apps/api/internal/modules/organization/returns_policy_test.go`
- `apps/api/internal/modules/pos/queries.go`
- `apps/api/internal/modules/pos/registers.go`
- `apps/api/internal/modules/returns/domain.go`
- `apps/api/internal/modules/returns/domain_test.go`
- `apps/api/internal/modules/returns/http.go`
- `apps/api/internal/modules/returns/posting.go`
- `apps/api/internal/modules/returns/queries.go`
- `apps/api/internal/modules/returns/refunds.go`
- `apps/api/internal/modules/returns/service.go`
- `apps/api/internal/platform/database/database.go`
- `apps/api/internal/transport/router.go`
- `apps/web/src/app/router.tsx`
- `apps/web/src/app/routes.ts`
- `apps/web/src/features/pos/POSPages.tsx`
- `apps/web/src/features/returns/ReturnsPage.tsx`
- `apps/web/src/features/returns/copy.ts`
- `apps/web/src/features/returns/returns-hooks.test.tsx`
- `apps/web/src/features/returns/returns-hooks.ts`
- `apps/web/src/lib/pos-api.ts`
- `apps/web/src/lib/returns-api.test.ts`
- `apps/web/src/lib/returns-api.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/styles/returns.css`
- `database/migrations/000008_business_operations.up.sql`
- `docs/architecture/business-operations.md`
- `docs/architecture/modules.md`
- `docs/architecture/overview.md`
- `docs/architecture/pos.md`
- `docs/architecture/roadmap.md`
- `docs/architecture/routes.md`
- `docs/business-flows/customer-returns.md`
- `docs/business-flows/refund-settlement.md`
- `docs/database/business-operations.md`
- `docs/database/overview.md`
- `docs/database/sales-transactions.md`
- `docs/development/phase5-verification.md`
- `docs/development/verification.md`
- `docs/security/security-model.md`
- `package.json`
- `packages/contracts/openapi.yaml`
- `scripts/check-contracts.mjs`
- `tests/e2e/returns.spec.ts`
- `tests/integration/auth-check.sh`
- `tests/integration/catalog.sql`
- `tests/integration/foundation.sql`
- `tests/integration/identity.sql`
- `tests/integration/inventory.sql`
- `tests/integration/organization.sql`
- `tests/integration/returns-fixtures.mjs`
- `tests/integration/returns-flow.mjs`
- `tests/integration/returns-safety.mjs`
- `tests/integration/returns-shelves.mjs`
- `tests/integration/returns.sql`
