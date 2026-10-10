# Phase 4 — สถานะการทำงานต่อและการตรวจสอบ

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
