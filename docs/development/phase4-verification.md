# Phase 4 — Final Local Acceptance Verification

## Final decision — 2026-10-10 (Asia/Bangkok)

**Phase 4: COMPLETED (Local).** Mandatory local acceptance gates ผ่านแล้วกับ code เดิมของ Phase 4 ไม่มีการ rewrite application code, commit, push, deployment, ลบ volume หรือเปลี่ยน primary development database ผลก่อนหน้าที่ถูก BLOCKED เก็บไว้ท้ายรายงานเป็น historical evidence ไม่ใช่สถานะปัจจุบัน

## 1. Actual environment

| Component               | สถานะที่ตรวจจริง                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Docker Desktop / Engine | เริ่มต้น daemon ไม่ทำงาน; เปิด Desktop แล้ว Engine 29.8.2 พร้อมใช้งาน                        |
| Docker Compose          | v5.5.1; config validation และ isolated stack startup ผ่าน                                    |
| Test project            | `smartpos-auth-test`; PostgreSQL/API/Caddy/web/AI/Mailpit healthy ก่อน cleanup               |
| PostgreSQL              | 17.11; mount เป็น `smartpos-auth-test_postgres-data` ไม่ใช่ primary `smartpos_postgres-data` |
| Caddy                   | v2.10.2; actual gateway ใช้ port 18088                                                       |
| Host Go                 | go1.27.2 windows/amd64, CGO_ENABLED=0; ไม่เปลี่ยน host configuration                         |
| Check-container Go      | go1.26.9 linux/amd64, CGO_ENABLED=1, GCC 15.2.0; race detector ใช้งานได้                     |
| Node / npm              | v24.21.0 / 11.19.0                                                                           |
| Playwright              | 1.64.0; Chromium/headless shell revision 1248 ติดตั้งอยู่แล้ว ไม่ติดตั้ง browser เพิ่ม       |

Build/check images ใช้ Dockerfiles และ dependency declarations เดิม การติดตั้ง build-base เกิดเฉพาะ api-check image ตาม Dockerfile ไม่ใช่เปลี่ยนเครื่องมือบน host

## 2. Migration and database verification

- สร้าง fresh scratch `smartpos_phase4_final_93f36d91` ภายใน PostgreSQL ของ test project เท่านั้น และตรวจ mount guard ก่อนสร้าง
- ใช้ `migrate/migrate:v4.18.3` runner จริงรัน `up 1` แยกทีละ migration **000001 → 000007** ทุกขั้นตรวจ tracker ได้ `1|f` ถึง `7|f`
- Fresh scratch rerun `up` ได้ **no change**; test database เดิมก็ rerun ได้ **no change** และ final tracker **7|f**
- Foundation/identity/organization/catalog/inventory SQL ผ่านทั้ง test database และ fresh scratch โดยจบด้วย **ROLLBACK**; scratch ไม่มี users/organizations/stock_movements ค้างจาก SQL fixtures
- Fresh Phase 4 rollback-only checks ยืนยัน FORCE RLS และ tenant USING/WITH CHECK policies ทั้ง 9 tables, runtime SELECT/INSERT grants, no DELETE ยกเว้น purchasing_items ตาม schema, unset tenant และ stock projection grants
- Runtime flags `rolsuper|rolbypassrls|rolcanlogin` ได้ **f|f|f**; runtime ไม่สามารถ INSERT/UPDATE/DELETE stock_balances โดยตรง
- หลัง API/browser/concurrency tests ตรวจ FULL JOIN ledger aggregate กับ balances ทั้ง isolated test database: **0 mismatches**

Fresh scratch และ test volume เก็บไว้ ไม่ DROP, ไม่ down migrations, ไม่ down -v และไม่เปิด primary database

## 3. Purchasing integration

`npm run verify:purchasing` ผ่าน flow **175 assertions** และ safety เดิม **118 assertions** จากนั้นเพิ่ม required coverage เฉพาะ test และ rerun `node tests/integration/purchasing-safety.mjs` ผ่าน **125 assertions** จึงใช้ผลล่าสุด **175 + 125 = 300 assertions** ไม่บวกการ rerun ซ้ำเป็นจำนวน coverage ใหม่ `verify:shelves` เป็น alias ของชุดเดียวกัน ไม่ใช่ suite เพิ่มอีกชุด

ครอบคลุม supplier create/read/update/revisions, supplier-product links, exact money/unit conversion, PO draft/approval/issue, partial receiving, full receiving, over-receipt denial, damaged/rejected discrepancy evidence, supplier returns และ deterministic purchase suggestions

รับสินค้าเข้า Inventory พร้อมเอกสาร/parent accepted totals/ledger/balances แบบ atomic; multi-item failure ไม่ทิ้ง stock หรือ parent update บางส่วน Retry และ concurrent duplicate receipt ด้วย key เดิมคืน receipt เดิมและมี movement เพียง 1 รายการ Suggestions สร้างได้เฉพาะ DRAFT ไม่ auto-approve หรือ post stock

## 4. Shelf integration

ชุด purchasing/safety เดียวกันตรวจ shelves, ordered slots, assignments, minimum/target/capacity validation, recorded quantity จาก Ledger, replenishment suggestions/tasks, assignment/start/complete และ warehouse-to-shelf Inventory transfers

ตรวจ stock conservation, duplicate task completion, capacity revalidation, insufficient current warehouse stock, POS-vs-replenishment และ supplier-return-vs-sale races Shelf counts ใช้ Inventory count lifecycle เดิมจน POSTED และแสดง last_count/variance; discrepancy ไม่ปรับ stock โดยไม่มี authorized Inventory posting

## 5. Concurrency and security evidence

| Gate                         | Result / หลักฐาน                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrent partial receiving | PASSED; competing receipts เกิน outstanding มีเพียงหนึ่งรายการ post อีกครั้งได้ 409                                                   |
| Duplicate receipt posting    | PASSED; concurrent same-key requests และ sequential retry ได้ receipt เดิม, movement เดียว                                            |
| Receiving rollback           | PASSED; multi-item conflict ไม่เกิด partial stock/PO totals; consistency-constraint failure rollback                                  |
| Supplier return deduction    | PASSED; authorized dispatch/replay, concurrent return limits และ insufficient current stock denial                                    |
| Duplicate replenishment      | PASSED; concurrent completion คืน result เดิมและ warehouse/shelf conserved                                                            |
| Tenant / branch / RBAC       | PASSED; foreign documents/shelves hidden, scoped Manager, staff approval denial, revoked membership และ replay authorization          |
| Runtime RLS / grants         | PASSED; 9 FORCE RLS tables, direct supplier cross-tenant read/write denial, composite tenant FK และ immutable posted/issued snapshots |
| CSRF / Origin                | PASSED; เพิ่ม negative requests จริงบน purchasing/orders และ shelves ทั้ง missing token และ hostile Origin ได้ 403                    |
| Stale revisions              | PASSED; supplier/draft stale revision ถูกปฏิเสธ และ immutable issued/posted documents ไม่ถูกแก้ย้อนหลัง                               |

ไม่พบ security-control failure ที่ยังไม่แก้ใน gates ที่รัน ไม่มีการ bypass/ลด thresholds/ปิด RLS/ยกเลิก assertions เพื่อให้ tests ผ่าน ผลนี้ไม่ใช่ full penetration test หรือ compliance certification

## 6. Playwright and visual verification

`node scripts/check-auth.mjs` ผ่าน **18/18 tests**, 4 workers, 57.0 seconds script ตั้ง `AUTH_E2E=1`, actual gateway และ real-client proxy ให้เอง Phase 4 ไม่ใช้ mock purchasing/shelf API responses

Phase 4 scenario ผ่าน supplier create, PO approval/issue/receiving, supplier return, shelf/slot/assignment, replenishment และ role-denied pages ตรวจ **15 routes × 7 widths**: 320, 375, 640, 768, 1024, 1440, 1920 px ไม่มี page horizontal overflow หรือ unexpected alert/pageerror ตาม assertions

ตรวจภาพจริงทั้ง 6 ภาพ: `order-320.png`, `order-768.png`, `order-1440.png`, `shelf-320.png`, `shelf-768.png`, `shelf-1440.png` ใน `test-results/purchasing-Phase-4-real-pu-6a7d0-ssions-and-responsive-views/` Layout/forms/navigation ไม่พบ overlap ที่ปิดบัง controls; wide tables อยู่ใน horizontal-scroll container บนหน้าจอแคบ ไม่ใช่แสดงครบทุก column พร้อมกัน ไม่มี full accessibility audit หรือ hardware trial

รายงาน browser อยู่ใน `playwright-report/index.html`; screenshots/reports เป็น ignored local artifacts ไม่ commit/publish traces ที่อาจมี synthetic session material

## 7. Go race checks

`docker compose -p smartpos-auth-test --profile checks run --build --no-deps --rm api-check` **PASSED**: gofmt inspection, `go vet ./...`, `go test -race ./...` และ `go build ./cmd/server` ครบทุก Go packages รวม purchasing Host CGO blocker เดิมได้รับการแก้ในแง่ acceptance ด้วย check container ที่รองรับ ไม่ได้เปิด CGO หรือแก้ routing/config บน host

## 8. Regression results

| Command / suite                        | ผลปัจจุบัน                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm test`                             | PASSED; 15 files, 75 frontend tests และ contracts                                                                   |
| `npm run typecheck`                    | PASSED                                                                                                              |
| `npm run lint`                         | PASSED; 0 errors, 3 existing Fast Refresh warnings                                                                  |
| `npm run build`                        | PASSED; existing chunk-size warning, largest JS 571.55 kB                                                           |
| Foundation/gateway integration-check   | PASSED; DB RLS/constraints, API/AI readiness, SPA route, internal forecast not exposed; expected 404 ไม่ใช่ failure |
| `node tests/integration/auth-flow.mjs` | PASSED; auth/reset/session, spoofing/rate limits, CSRF, SMTP outage และ sanitized logs; Mailpit restored            |
| `npm run verify:organization`          | PASSED; onboarding/branches/invitations/RBAC/tenant/revocation/last-owner concurrency                               |
| `npm run verify:catalog`               | PASSED; 116 assertions                                                                                              |
| `npm run verify:inventory`             | PASSED; 135 assertions                                                                                              |
| `npm run verify:pos`                   | PASSED; 132 flow + 64 safety assertions ในรอบนี้                                                                    |
| Purchasing/Shelves                     | PASSED; latest 175 flow + 125 safety assertions                                                                     |
| Playwright all phases                  | PASSED; 18/18 tests ไม่ skip integrated suites                                                                      |
| AI check container                     | PASSED; Ruff/check/format, 7 Python tests; 1 existing Starlette/httpx deprecation warning                           |

เก็บตัวเลข historical POS 197/browser 17 ในรายงาน Phase 3 ตามเดิม ไม่เปลี่ยนให้ดูเหมือนผลรอบนี้ จำนวนปัจจุบันใช้จาก stdout จริงข้างต้น

## 9. Changes, resolved failures and remaining limits

Initial rollback-only runner ล้มเหลวด้วย `identity migration not ready`: SQL fixtures 5 ไฟล์ยังตรวจ exact schema 5 ทั้งที่ actual tracker และ API require schema 7 แก้เฉพาะ expected version เป็น **exact 7 AND NOT dirty** ใน foundation/identity/organization/catalog/inventory SQL แล้ว original runner และ fresh scratch SQL ผ่าน ไม่แก้ migration ที่ใช้แล้วและไม่ลด constraints/RLS/assertions

เพิ่ม CSRF/Origin และ concurrent duplicate receipt coverage ใน `tests/integration/purchasing-safety.mjs` เท่านั้น Application code, production settings, dependencies และ security controls ไม่เปลี่ยน Initial Docker inspection/final read-only Docker check เคย timeout; rerun ด้วยเวลาที่เหมาะสมแล้วผ่าน ไม่ปิดบังเป็นผลสำเร็จตั้งแต่ครั้งแรก

ข้อจำกัดยังคงเป็น production gates: dedicated least-privilege LOGIN (bootstrap connection ยัง privileged แม้ SET ROLE runtime), TLS/secrets/SMTP, backups/restore/rollout, load/hardware trials, full accessibility, retention และ operations Shelf capacity เป็น configured quantity ไม่ใช่การวัดพื้นที่จริง PO issue เป็น operator-recorded evidence ไม่ใช่ยืนยันส่ง email ถึง supplier Suggestions เป็น deterministic ไม่ใช่ ML ไม่มี auto-approval/auto-purchasing

## 10. Final status and Phase 5 readiness

**Phase 0–4: COMPLETED (Local). Phase 5: NOT STARTED.** พร้อมใช้ local acceptance นี้เป็นฐานวางแผน Phase 5 หลังมีขอบเขตและอนุญาตแยกต่างหาก ไม่ได้อนุมัติ production release, deployment หรือเริ่ม Phase 5 อัตโนมัติ

Cleanup สำเร็จ: `docker compose -p smartpos-auth-test stop` หยุดเฉพาะ task test stack หลัง checks ผ่าน โดยเก็บ containers/networks, fresh scratch และ volumes ทั้ง `smartpos-auth-test_postgres-data` / `smartpos_postgres-data` ไว้ Docker Engine ยังพร้อมใช้งาน การหยุด stack หลังจบไม่ใช่ environment blocker

## Historical evidence — previous blocked continuation

ส่วนต่อไปนี้คงหลักฐานรอบก่อนซึ่ง Docker/CGO ยังถูก BLOCKED ทุกคำว่า pending/not run ในส่วน historical นี้ถูก supersede ด้วยผล final acceptance ด้านบน

วันที่ตรวจ: **2026-10-10 (Asia/Bangkok)**

สถานะ: **IMPLEMENTED; LOCAL ACCEPTANCE PENDING** ไม่ใช่ COMPLETED และไม่ใช่ production readiness

## ขอบเขตที่พบ

งานเดิมใน working tree มี Go module `purchasing`, policy ของ organization, จุดเชื่อม inventory, React purchasing/shelf pages, typed API client, OpenAPI, migration `000007_purchasing_shelves.up.sql` และชุดทดสอบ unit/integration/browser อยู่แล้ว รอบนี้รักษาการแก้ไขเดิมและปรับเอกสารสถานะ ไม่มีการแก้ application code เพิ่ม

- Supplier และ supplier-product links
- Purchase orders, receiving, supplier returns และ document actions
- Shelves, slots, assignments และ replenishment tasks
- Suggestions แบบ deterministic; ไม่ใช่ ML forecast หรือการอนุมัติอัตโนมัติ
- API readiness ใน code ต้องการ schema version 7; ยังไม่ได้ยืนยัน schema จริงในรอบนี้

## ผลที่รันจริง

| Check / command                                                                                 | Result               | หลักฐานและข้อจำกัด                                                                             |
| ----------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| Focused Vitest: purchasing-api และ purchasing-hooks                                             | PASSED               | 2 files, 11 tests                                                                              |
| `npm test`                                                                                      | PASSED               | 15 frontend test files, 75 tests และ contract check                                            |
| `npm run contracts:check`                                                                       | PASSED               | Canonical inventory ยังคง 16 modules / 106 routes; ไม่ใช่หลักฐาน runtime API                   |
| `npm run typecheck`                                                                             | PASSED               | TypeScript workspace                                                                           |
| `npm run lint`                                                                                  | PASSED WITH WARNINGS | 0 errors; 3 existing Fast Refresh warnings ใน AuthProvider, OrganizationProvider และ AuthPages |
| `npm run build`                                                                                 | PASSED WITH WARNING  | Production web build สำเร็จ; JavaScript chunk ใหญ่กว่า 500 kB                                  |
| `go vet ./...`                                                                                  | PASSED               | รันจาก `apps/api`                                                                              |
| `go test ./...`                                                                                 | PASSED               | Go suite ทั้ง API; ไม่ได้เปิด PostgreSQL หรือรัน integration scripts                           |
| `go build ./...`                                                                                | PASSED               | Go packages ทั้ง API                                                                           |
| `gofmt -l` บน changed/untracked Go files                                                        | PASSED               | ไม่พบไฟล์ที่ต้อง format                                                                        |
| Prettier check บน purchasing frontend, CSS, OpenAPI, contract checker และ purchasing test files | PASSED               | ไม่ได้ใช้ formatter แบบ write                                                                  |
| `git diff --check`                                                                              | PASSED               | ไม่มี whitespace errors ใน diff ที่ตรวจ                                                        |
| `docker ps`                                                                                     | BLOCKED              | ไม่พบ named pipe `dockerDesktopLinuxEngine`; ลองนอก sandbox แล้วยังล้มเหลว                     |
| `go test -race ./...`                                                                           | BLOCKED              | Toolchain รายงานว่า race detector ต้องการ cgo; ไม่ได้เปลี่ยน toolchain configuration           |
| Migration 7 / SQL / real API integration                                                        | NOT RUN — BLOCKED    | Docker daemon ไม่พร้อม; ไม่มีการเปลี่ยนฐานข้อมูลในรอบนี้                                       |
| Playwright purchasing/shelves และ runtime regressions                                           | NOT RUN — BLOCKED    | Isolated stack ไม่พร้อม; ไม่อ้างผลจาก `.last-run.json` หรือรายงานเก่า                          |
| Visual / responsive screenshot inspection                                                       | NOT RUN — BLOCKED    | ยังไม่มี current browser run ให้ตรวจ                                                           |

คำสั่ง frontend และ Go บางรายการถูก sandbox ปฏิเสธในครั้งแรก (`spawn EPERM` / build-cache access denied) จึงรันซ้ำผ่าน approval mechanism และได้ผลตามตาราง ไม่ได้แก้ execution rules หรือ permissions configuration

## Gate ที่ต้องทำต่อ

1. เปิด Docker Desktop Linux engine และตรวจ isolated `smartpos-auth-test` stack ตาม runbook เดิม ห้ามใช้ primary persistent volumes แทนเพื่อให้ tests ผ่าน
2. ตรวจ migration 7, readiness, constraints/RLS/grants และ migration rerun ใน isolated database ก่อนเรียก API suites
3. รัน `npm run verify:purchasing` ซึ่งรวม purchasing-flow และ purchasing-safety; `verify:shelves` เป็น alias ของชุดเดียวกัน ไม่ใช่หลักฐานเพิ่มอีกชุด
4. รัน regression ของ auth/organization/catalog/inventory/POS กับ isolated stack และ Go race checks ด้วย toolchain ที่รองรับ cgo
5. รัน purchasing Playwright โดยเปิด `AUTH_E2E=1` ตาม test setup เดิม พร้อมตรวจ responsive screenshots ก่อนปิด local acceptance gate

ชุดทดสอบ integration/browser ที่มีอยู่ครอบคลุมเส้นทาง purchasing/shelves แต่การมีไฟล์ทดสอบไม่เท่ากับผ่าน tests รอบนี้ยังไม่ยืนยัน receiving/return/replenishment concurrency, ledger reconciliation, runtime authorization หรือ responsive behavior

ไม่มี commit, push, deployment, migration, destructive operation หรือการเริ่ม Phase 5 ในรอบนี้ เอกสาร Phase 1–3 เป็น historical evidence และยังคงไว้ตามเดิม
