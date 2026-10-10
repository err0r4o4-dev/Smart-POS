# Phase 5.4 — Customer Management verification

วันที่ตรวจ: **2026-10-10 (Asia/Bangkok)**. สถานะ: **Phase 5.4 COMPLETED (Local)** หลัง mandatory acceptance gates ผ่าน. ไม่กล่าวว่า production-ready. Phase 0–5.3 คง COMPLETED (Local), Phase 5 overall PARTIAL, 5.5–5.6 NOT STARTED, 5.7 PARTIAL และ Phase 6 NOT STARTED / NOT READY.

## Implementation และไฟล์หลัก

- `apps/api/internal/modules/customers/`: CRUD/search/filter/pagination/archive, normalization/duplicates/revisions/idempotency, groups/counts/memberships, audit และ read-only financial history พร้อม unit/request tests.
- `database/migrations/000011_customers.up.sql` และ `apps/api/internal/platform/database/database.go`: สาม Customer tables, FORCE RLS, least-privilege grants, tenant-safe references, immutable code snapshot และ readiness11. Migrations1–10 ไม่เปลี่ยน.
- `apps/api/internal/modules/organization/{policy.go,customer_policy.go}` และ `apps/api/internal/transport/router.go`: explicit fixed-role permissions และ routing ผ่าน existing sessions/organization middleware.
- `apps/api/internal/modules/pos/`: customer selection/removal, held-cart revalidation, checkout freeze/complete และ replacement Sale historical inheritance ใน transaction เดิม ไม่แก้ pricing/payment/Inventory authority.
- `apps/web/src/features/customers/`, `apps/web/src/lib/customers-api.ts`, router/navigation และ POS/Sale views: สาม planned routes จริง, TH/EN, optional contact/explicit opt-in, group workflows/history, picker/Walk-in และ receipt code snapshot.
- `packages/contracts/openapi.yaml`, `scripts/check-contracts.mjs`: 11 new Customer/POS path templates / 14 operations; no arbitrary customer ID in checkout input. Group request DTO แยกจาก response และไม่รับ server-managed ID/status/member_count.
- `tests/integration/customers-{flow,safety}.mjs`, `customers.sql`, `customers-reconciliation.sql`, `tests/e2e/customers.spec.ts` และ `scripts/check-phase54*.mjs`: executable acceptance. Existing SQL suites เปลี่ยนเฉพาะ exact schema-readiness assertion10→11 ไม่ลด assertions.
- README/TODO/roadmap/routes/modules/overview/database/security และ `docs/architecture/customers.md`: implementation boundaries, authoritative financial definitions, privacy/retention และ production gates.

## Environment และ safety

ใช้เฉพาะ Docker project **smartpos-auth-test**, gateway `http://localhost:18088`, API18080/web15173/PostgreSQL15432/Mailpit18025. Active synthetic database ระบุใน `.local/phase54-database.json` และขึ้นต้น `smartpos_phase53_phase54_` เพื่อ compatibility กับ established auth/pricing fixtures. Customer fixture และ full Phase54 runner ตรวจ prefix และตรวจ actual API database target ผ่าน project-qualified Docker exec ก่อน fixtures/baseline writes โดยไม่แสดง connection credentials. Guard positive ผ่าน; valid-prefix wrong target และ primary-name target ถูกปฏิเสธก่อน fixture writes. ไม่เปลี่ยน container config ใน negative checks.

Fresh migration final run สร้างและเก็บ scratch DB ใหม่แยกต่างหาก โดยไม่ switch gateway เพราะไม่มี `--start`. Primary DB/volumes ไม่ migrate ไม่ลบ. ไม่ stage/commit/push/create branch/deploy; พบ external commit ระหว่างงานและรักษาไว้ ไม่ rewrite history. ไม่มี dependencies/framework ใหม่หรือ Loyalty/Phase6 implementation.

## Executed checks

| Gate / command                                                                                          | ผลที่รันจริง | หลักฐานและข้อจำกัด                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CGO container `test -z "$(gofmt -l .)" && go vet ./... && go test -race ./... && go build ./cmd/server` | PASSED       | `.local/phase54-go-latest.log`; Customers และทุก existing Go package ผ่าน; ไม่แต่ง total Go test count                                                                                                                 |
| `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`                                        | PASSED       | `.local/phase54-web-delivery.log`; final rerun หลัง guard/docs; 20 Vitest files / **103 tests**; contracts ผ่าน; lint0errors/3 existing fast-refresh warnings; bundle-size warning ไม่ถูกปกปิด                         |
| Baseline16 API suites Phase0–5.3                                                                        | PASSED       | `.local/phase54-regression-results.json` และ per-suite logs; **1,699 numbered assertions** สำหรับ suites ที่นับ, Auth/Organization ไม่มี count ไม่แต่งเพิ่ม                                                            |
| `npm run verify:customers`                                                                              | PASSED       | `.local/phase54-customers-guard-final.log`: **150 flow +103 safety =253 assertions** บน strict GroupInput API ล่าสุด พร้อม actual-target guard; previous latest253 ผ่านเช่นกัน                                         |
| Real gateway `node scripts/check-auth.mjs --workers=1`                                                  | PASSED       | `.local/phase54-browser-latest.log`: full **25/25** บน permission-aware cache ล่าสุด; `.local/phase54-customers-browser-guard-final.log`: final strict GroupInput API +guard focused **2/2** รวม POS context switching |
| `node scripts/check-phase54-migrations.mjs`                                                             | PASSED       | `.local/phase54-migrations-final.log`: fresh1–11, clean tracker, no-change rerun, constraints/FORCE RLS/grants และ **8 rollback-only SQL suites** ผ่าน                                                                 |
| AI regression container                                                                                 | PASSED       | `.local/phase54-container-check.log`: lint/format และ **7 tests**; existing Starlette/httpx deprecation warning                                                                                                        |
| Docker/Caddy/gateway smoke                                                                              | PASSED       | `.local/phase54-stack-reconciliation.log`: config quiet, Caddy validate, schema/health/service communication/real frontend routing; internal AI path404ตามที่ต้องปิด                                                   |
| Sale/payment/pricing/Inventory reconciliation                                                           | PASSED       | pricing-reconciliation.sql **8 checks zero violations**; stock ledger/balance, exact consideration, discounts/redemptions/NONE/physical deduction                                                                      |
| Customer reconciliation                                                                                 | PASSED       | `.local/phase54-customer-reconciliation.log`: Sale/checkout/cart linkage, historical replacement ID/code inheritance, membership tenant linkage **3 checks zero violations**                                           |
| Formatting / diff / old migrations                                                                      | PASSED       | `npm run format:check`, `git diff --check`; final rerun หลังเอกสารอยู่ใน delivery log; compare against pre-Phase54 parent แสดงเพียง migration11 ใหม่                                                                   |

API assertion counts เป็นจำนวน assertion ไม่ใช่ independent test cases. Baseline16 suites **1699** + Customers2 suites **253** = **1952 numbered assertions across18 API suites** จาก baseline/focused runs แยกกัน ไม่อ้างว่าเป็น one-shot final aggregate. Regression result JSON เริ่มก่อนเพิ่ม safety runner จึงมี17 rows; final Customers safety evidence แยกอยู่ใน focused log ไม่อ้างว่า JSONมี18 rows. Baselineไม่ได้รันทั้ง16ซ้ำหลัง final GroupInput-only tightening; Customers253 และfocused browser2/2 รันซ้ำบน finalAPI/guardแล้ว.

Final reconciliation rerun หลัง Customer fixtures ล่าสุด: `.local/phase54-reconciliation-delivery.log` ผ่านทั้ง pricing8 และcustomer3 checks, zero violations; actual psql exit0 ทั้งสองชุด. Primary DB ไม่ถูกใช้.

## Mandatory behavior evidence

- CRUD/archive, optional PII, explicit consent false, normalization/invalid controls/email/phone, duplicates รวม archived, literal prefix search, status/group filter และ server pagination: Customers flow + frontend tests + real E2E.
- Default/custom groups, edit/archive, assignment/removal/counts, foreign tenant membership, concurrent customer/group edits และ same-key parallel creates: flow/safety + runtime SQL. Replay rechecks current authorization ทั้ง customer/group create.
- POS select/remove, Walk-in, foreign/random IDs, checkout customer-field tampering, held customer clear, archiveหลัง prepare/acknowledge → reconciliation และ immutable completed Sale/code: API acceptance; E2E actual UI/receipt/DB.
- Historical change/archive ไม่ rewrite Sale; positive/zero/negative exchange, refund pending/confirmed, full reversal และ archived-customer exchange retain links: flow/safety. Only external `sale_payments.amount` counted; confirmed refundครั้งเดียว, return/exchange creditไม่ใช่ new money.
- Runtime RLS/no-context, least privilege/no hard deletion, composite tenant FK, backend RBAC/branch revocation, CSRF/Origin และ PII-free audit/generic errors: flow/safety/SQL และ existing auth/organization regression.
- Customer page queries/drafts และ POS picker/cart ไม่ค้างข้าม organization/branch/logout: real E2E. Same-user manage downgrade ไม่ใช้ cached full phone/email: reproduced failing unit test แล้วแก้ permission-aware query keys/workspace key; unit rerun ผ่าน.

## Responsive และ visual evidence

Real Customer list/detail/groups และ POS picker ตรวจ **320,375,768,1280,1920px** ผ่าน no-horizontal-overflow assertions ทั้ง20 route/width combinations. New E2E เก็บ8 screenshots ที่320/1280 ใต้ `test-results/customers-Phase-5-4-real-C-9e7ed-hive-and-responsive-layouts/`. ตรวจภาพจริงครบ8ภาพ เรื่อง typography, wrapping, spacing, controls และ clipping บน narrow/wide layouts; ไม่พบ horizontal clipping. ข้อมูลภาพเป็น synthetic fixtures เท่านั้น. ไม่อ้าง full WCAG audit หรือ physical printer validation.

## Failed attempts และ fixes

- เริ่ม tests ก่อน implementation: undefined Go domain/filter และ missing CustomerPicker เป็น expected failures; implementแล้ว unit/race ผ่าน.
- Fresh migration initial run พบ SQL readiness assertionsยัง10; updateเฉพาะ version11 assertions แล้ว fresh/rerun8 SQL suitesผ่าน. Startupครั้งหนึ่ง timeoutระหว่าง build/start; ไม่นับ timeoutเป็นPASS และตรวจ gateway/DBจริงภายหลัง.
- Flow fixtureส่ง response fieldsกลับเป็น input โดน unknown-field400; whitelist editable fieldsตาม contract. Settlementต้องมี note และ refundใช้ `refund_id` / `confirm-settlement`; แก้ fixtureให้ตรง existing engine ไม่เปลี่ยน business invariants.
- Contract checkerยังคาด old paths; เพิ่ม exact11 paths และ operation/schema/security checks แล้วผ่าน. Optional group filter frontendไม่ส่ง empty UUID; raw lowercase/trimmed code input schemaตรง normalizationแล้ว.
- Browser initial empty-state selectorสั้นกว่าข้อความจริง; ใช้ exact rendered accessible text. Organization testรหัสคงที่ชน retained run; ใช้ unique synthetic code. Test initializationเคยเขียน tenant Aทับทุก navigation; เปลี่ยนให้ seedเฉพาะไม่มี selection และเพิ่ม assertionว่าหลัง navigationยังอยู่tenant B. ทั้งหมดเป็น fixture fixes ไม่เปลี่ยน denial assertionให้ผ่านผิดๆ.
- พบ actual frontend privacy gap: same-user customer.manage downgrade ยังแสดง old cached full contact; failing regression testพิสูจน์ก่อนแก้. เพิ่ม permission identityใน Customer/POS queries และ workspace remount; latest103 testsผ่าน.
- Group decoderเดิมใช้ response modelทำให้ server-managed fieldsถูกยอมรับแม้ไม่ถูกใช้; แยก GroupInput และเพิ่ม unit/API rejection coverage. Final Go checks และ Customers safety103 assertions ผ่าน รวม forbidden id/status/member_count ทั้ง3 checks.
- Sandbox process/Docker pipe restrictions ใช้ scoped approval ไม่แก้ execution policy. PowerShell stderrแสดง PostgreSQL NOTICEเป็น NativeCommandError annotation แม้ exit0; ตรวจ actual exit/outputแยก ไม่ถือ NOTICEว่า failed SQL.

## Reproduction

```powershell
$env:AUTH_TEST_DATABASE=(Get-Content -Raw .local/phase54-database.json | ConvertFrom-Json).database
$env:POSTGRES_DB=$env:AUTH_TEST_DATABASE
$env:POSTGRES_PORT='15432'; $env:API_PORT='18080'; $env:WEB_PORT='15173'
$env:GATEWAY_PORT='18088'; $env:MAILPIT_PORT='18025'; $env:PUBLIC_ORIGIN='http://localhost:18088'
npm run verify:customers
npm run verify:phase54
node scripts/check-phase54-migrations.mjs
docker compose -p smartpos-auth-test --profile checks run --build --rm api-check
npm run typecheck; npm run lint; npm test; npm run build; npm run format:check
git diff --check
```

Migration checkerโดยไม่มี `--start` สร้าง scratch ใหม่และไม่เปลี่ยน gateway; `--start` ต้องตั้งใจใช้เฉพาะ isolated test stack. ไม่ใช้ unqualified migration/resilience commandกับ primary.

## Limitations / production gates

- Archiveไม่ใช่ hard deletion/merge/restore; retained transaction/code/membership/fingerprint dataต้องมี approved retention/erasure policy. Contact fieldsไม่จำเป็น และไม่มี identity document collection.
- Marketing opt-inเป็น explicit flag ไม่ใช่ legal consent certification. Customer historyเป็น settled/pending cash activity ไม่ใช่ tax/profit/LTV report. Cashierไม่มี financial history permission; current branch filterไม่ใช่ทั้งองค์กรโดยอัตโนมัติ.
- No production migration/deployment, destructive cleanup, backup/restore drill, load/soak certification, real scanner/printer/payment gateway หรือ full accessibility/security audit. Separate production gates: dedicated runtime LOGIN, TLS/secrets/SMTP, backups/restore/rollout, retentionและoperational monitoring.
- Existing destructive resilience runnerไม่ได้รันเพราะ primary-target safety; isolated auth SMTP outage/rate-limit และ dependency/gateway regressionผ่าน. Phase5.5 Loyalty,5.6 Batch/Quality และPhase6ไม่เริ่ม. คง16 modules/106 planned routes.
