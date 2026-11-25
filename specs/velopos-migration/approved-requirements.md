# VELOPOS — Approved Master Requirements Register (Scope 01–92)

> **Status:** Approved scope decisions / authoritative baseline for the SmartPOS → VELOPOS brownfield migration.  
> **Register ID:** VELOPOS-SCOPE-BASELINE-001  
> **Coverage:** Exactly **92 approved scope decisions** (`VLP-001`–`VLP-092`), recorded from the user's explicit choices in the VELOPOS planning conversation.  
> **Intended location in repository:** `specs/velopos-migration/approved-requirements.md`  
> **Use with:** `requirements.md` → `design.md` → `tasks.md` in Spec-Driven Development (SDD).

## Source and approval boundaries

This file consolidates the **92 scope selections already confirmed by the project owner in conversation**. It is a scope reference for the existing SmartPOS repository, **not** evidence that features are implemented or tested. The concise Thai wording below preserves the decisions and important business invariants. Because this is a compiled register rather than a verbatim exported transcript, Codex should surface any ambiguity before implementing a material business rule, rather than inventing details.

- `VLP-NNN`: stable requirement identifier. `Scope NN` and `Decision A/B/C/D`: original questionnaire position and the exact option chosen.
- **Approved requirement**: binding business scope to be compared with existing code.
- **Verification intent**: suggested testable interpretation derived from the approved requirement, **not an additional independently approved feature**. Turn this into final acceptance criteria after inspecting the actual repository.
- **Open policy values**: numbers, limits, provider selection, contractual or legal choices not confirmed in the conversation remain **TBD**, never silently invent them.
- Scope **93** (Restaurant Menu Images & Media Management) was asked but **not approved**, and is deliberately **excluded** from this baseline. This register must not be padded to 93 or replaced with placeholders.
- The source of truth for approval is the project owner's selected scope decisions, **not** the generated `requirements.md` placeholders or current application behavior.

## Non-negotiable cross-cutting invariants

1. **Brownfield migration:** audit and incrementally refactor existing SmartPOS; do not rebuild everything blindly, rewrite history, remove production data, push or deploy without the required approval.
2. **One restaurant per Checkout** (`VLP-001`), with separate orders and financial boundaries per restaurant (`VLP-010`, `VLP-034`).
3. **Money flow:** PromptPay food payment confirmed by a capable Provider and settled **directly to the restaurant** (`VLP-004`); VELOPOS may collect its own Pro/Ads fees separately (`VLP-035`–`VLP-043`), but does not custody food revenue or refund it from platform funds (`VLP-014`, `VLP-064`). Provider support and terms must be checked, not assumed.
4. **FIFO:** one strict FIFO order queue per restaurant, across all ordering modes, only **after verified Paid** and based on the successful payment time (`VLP-003`, `VLP-005`). Delayed callbacks and retries must not duplicate or unfairly reorder entries (`VLP-063`, `VLP-081`).
5. **Lifecycle separation:** `Payment ≠ Kitchen ≠ Fulfillment`; `Ready ≠ Completed`; `No-Show ≠ Handover` (`VLP-006`, `VLP-085`, `VLP-088`). Verified completion requires actual handover.
6. **Checkout safety:** server-authoritative prices/options/quotas, atomic reservations, idempotency, payment reconciliation, no unsafe retries or premature quota release (`VLP-059`, `VLP-062`, `VLP-063`, `VLP-078`–`VLP-083`).
7. **Ownership and access:** one Owner account per restaurant; one Owner may manage distinct restaurants; no staff module and no LINE integration (`VLP-010`, `VLP-023`, `VLP-031`); verify onboarding and transfers (`VLP-065`, `VLP-067`).
8. **Privacy:** tenant isolation, secure Guest access, RBAC/MFA for elevated roles, data minimization, reliable audit records, and separated customer-visible/internal events (`VLP-012`, `VLP-045`, `VLP-046`, `VLP-070`, `VLP-089`).
9. **Historical truth:** preserve order snapshots and append-only/auditable business records; price changes, menu import, payment/refund or corrections must not rewrite historical paid transactions (`VLP-061`, `VLP-073`, `VLP-087`, `VLP-091`, `VLP-092`).
10. **No uncontrolled automation:** customer expressly confirms ordering/payment; no scheduled pickup, automatic overload pause, auto-refund for No-Show or forced Referral Program (`VLP-022`, `VLP-029`, `VLP-075`, `VLP-084`, `VLP-085`).

## Approved scope register

## Part I — Core Restaurant, Ordering and Marketplace Foundations

### VLP-001 — Single-Restaurant Checkout

- **Source / approved decision:** Scope 01 · **A**
- **Approved requirement:** ลูกค้าเลือกสินค้าและชำระเงินต่อหนึ่งร้านอาหารในหนึ่ง Checkout เท่านั้น สามารถมีออเดอร์ของร้านอื่นแยกกันได้ แต่ห้ามรวมหลายร้านไว้ในธุรกรรมเดียว
- **Verification intent (derived, not a new decision):** Checkout ต้องมี restaurant_id เดียว; รายการต่างร้านต้องแยก Checkout และออเดอร์

### VLP-002 — Merchant Self-Delivery

- **Source / approved decision:** Scope 02 · **A**
- **Approved requirement:** ร้านอาหารจัดส่งเอง ไม่มีระบบไรเดอร์หรือบริษัทขนส่งของแพลตฟอร์ม ร้านตั้งพื้นที่ให้บริการและค่าจัดส่งของตนเอง
- **Verification intent (derived, not a new decision):** คำสั่งซื้อ Delivery ระบุร้านเป็นผู้จัดส่ง; ไม่มีระบบรับงานไรเดอร์ของแพลตฟอร์ม

### VLP-003 — Paid Before Queue

- **Source / approved decision:** Scope 03 · **A**
- **Approved requirement:** ออเดอร์ต้องได้รับการยืนยัน Paid ที่เชื่อถือได้ก่อนเข้าสู่คิวครัว ออเดอร์ Pending หรือผลจ่ายไม่ชัดเจนต้องไม่เข้าคิว
- **Verification intent (derived, not a new decision):** ไม่มี Queue Entry ก่อน Verified Paid; การจ่ายที่ยืนยันแล้วไม่ถูกเพิ่มคิวซ้ำ

### VLP-004 — Provider-Verified PromptPay with Direct Merchant Settlement

- **Source / approved decision:** Scope 04 · **B**
- **Approved requirement:** ใช้ Payment Provider เพื่อสร้าง PromptPay QR และยืนยันการชำระเงินอัตโนมัติ เงินค่าอาหารต้องเข้าร้านโดยตรง ไม่ผ่านบัญชีรับฝากของ VELOPOS; ต้องตรวจสอบว่า Provider รองรับรูปแบบการรับเงินของร้านที่สมัครจริง
- **Verification intent (derived, not a new decision):** Backend ใช้ผลยืนยันจาก Provider แทนการเชื่อสลิป/ผู้ใช้; เงินอาหารไม่ถูกพักใน Platform Wallet

### VLP-005 — Single Strict FIFO Queue Per Restaurant

- **Source / approved decision:** Scope 05 · **A**
- **Approved requirement:** ร้านหนึ่งมีคิวออเดอร์เดียวรวม Dine-in, Takeaway, Pickup และ Delivery เรียงตามเวลา Paid ที่ได้รับการยืนยัน ห้ามให้ช่องทางใดแซงคิวหรือจัดลำดับเอง
- **Verification intent (derived, not a new decision):** คิวเดียวต่อร้าน; ลำดับคงตามเวลาชำระสำเร็จแม้สถานะครัวหรือช่องทางต่างกัน

### VLP-006 — Whole-Order Kitchen Status

- **Source / approved decision:** Scope 06 · **A**
- **Approved requirement:** สถานะการทำอาหารใช้ระดับทั้งออเดอร์ ได้แก่ Queued → Preparing → Ready โดยไม่ต้องมีสถานะครัวรายรายการอาหาร
- **Verification intent (derived, not a new decision):** อัปเดตสถานะตามทั้งออเดอร์; ไม่สร้าง KDS state ต่อ item เป็นขอบเขตบังคับ

### VLP-007 — Scheduled Hours and Manual Pause

- **Source / approved decision:** Scope 07 · **B**
- **Approved requirement:** ร้านกำหนดเวลาเปิด/ปิดรับออเดอร์อัตโนมัติตามตาราง และกด Pause รับออเดอร์เองได้ ออเดอร์ที่ชำระแล้วต้องยังดำเนินงานต่อ
- **Verification intent (derived, not a new decision):** นอกเวลา/ร้าน Pause ห้ามเริ่มออเดอร์ใหม่; Paid Orders ที่มีอยู่ไม่ถูกยกเลิกด้วยเหตุ Pause

### VLP-008 — Menu Options and Modifiers

- **Source / approved decision:** Scope 08 · **B**
- **Approved requirement:** ร้านจัดการหมวดหมู่ เมนู ราคา และ Option/Modifier เช่น โปรตีน ความเผ็ด Topping กลุ่มจำเป็น/ไม่จำเป็น ราคาเพิ่ม และสถานะพร้อมขาย โดยไม่ต้องตัดสต๊อกวัตถุดิบระดับส่วนผสม
- **Verification intent (derived, not a new decision):** Checkout ตรวจตัวเลือกที่จำเป็นและค่าบวก; ไม่มี requirement สูตรอาหารหรือ ingredient deduction

### VLP-009 — Admin Restaurant Approval

- **Source / approved decision:** Scope 09 · **B**
- **Approved requirement:** ร้านใหม่ต้องผ่านการตรวจสอบและอนุมัติโดย Platform Admin ก่อนปรากฏเป็นร้านเปิดขาย เจ้าของสามารถเตรียมข้อมูลร้าน/เมนูระหว่างรอได้
- **Verification intent (derived, not a new decision):** ร้าน Pending Approval เตรียมข้อมูลได้ แต่เปิดขายผ่าน Marketplace ไม่ได้

### VLP-010 — One Owner Account Manages Multiple Independent Restaurants

- **Source / approved decision:** Scope 10 · **B**
- **Approved requirement:** เจ้าของบัญชีเดียวดูแลร้านอาหารหลายร้านได้ แต่แต่ละร้านเป็น Entity อิสระ แยกเมนู คิว ออเดอร์ รายรับ การตั้งค่า และสถานะอนุมัติ ไม่มีโครงสร้างหลายสาขาที่ผูกร้านรวมกัน
- **Verification intent (derived, not a new decision):** เจ้าของสลับร้านที่ตนมีสิทธิ์ได้; ข้อมูล/คิว/ชำระเงินแยกตามร้าน

### VLP-011 — Hybrid Community Marketplace Directory

- **Source / approved decision:** Scope 11 · **C**
- **Approved requirement:** หน้า Marketplace แสดงร้านที่เข้าร่วมทั้งหมดและรองรับตัวกรองตามตลาด พื้นที่ หรือชุมชน เช่น กลุ่มร้านรอบมหาวิทยาลัย
- **Verification intent (derived, not a new decision):** หน้า Directory รวมร้านและมี Community/Market filters โดยไม่บังคับลูกค้าเข้าจากตลาดเดียว

### VLP-012 — Guest Checkout and Optional Member Account

- **Source / approved decision:** Scope 12 · **B**
- **Approved requirement:** ลูกค้าสั่งอาหารได้โดยไม่สมัครสมาชิก ใช้ Secure Token ติดตามออเดอร์ Guest; สมาชิกเข้าสู่ระบบเพื่อดูประวัติและข้อมูลบัญชีตน
- **Verification intent (derived, not a new decision):** Guest Checkout ทำงานได้; ไม่เปิดข้อมูล Guest Order จากเลขออเดอร์อย่างเดียว

### VLP-013 — Conditional Cancellation

- **Source / approved decision:** Scope 13 · **B**
- **Approved requirement:** ลูกค้าขอยกเลิกได้ก่อนสถานะ Preparing และต้องให้ร้านอนุมัติ หลังเริ่ม Preparing ไม่มีการยกเลิกปกติโดยลูกค้า ร้านสามารถยกเลิกหากไม่สามารถให้บริการได้; การคืนเงินต้องเป็น Workflow แยก
- **Verification intent (derived, not a new decision):** คำขอยกเลิกก่อน Preparing ไม่ใช่การยกเลิกโดยอัตโนมัติ; หลัง Preparing ใช้ข้อยกเว้น/ข้อพิพาทตามนโยบาย

### VLP-014 — Manual Food Refund by Merchant

- **Source / approved decision:** Scope 14 · **A**
- **Approved requirement:** หากคืนเงินค่าอาหาร ร้านเป็นผู้โอนเงินคืนลูกค้าโดยตรงและบันทึกสถานะ/หลักฐาน VELOPOS ไม่ดึงเงินออกจากร้านหรือคืนเงินค่าอาหารแทนร้าน
- **Verification intent (derived, not a new decision):** Refund record อ้างอิงออเดอร์; ไม่มีการเบิกจ่ายอาหารจาก platform treasury

### VLP-015 — Delivery Radius and Flat Fee

- **Source / approved decision:** Scope 15 · **A**
- **Approved requirement:** ร้านกำหนดรัศมีพื้นที่จัดส่งและค่าจัดส่งแบบคงที่ต่อออเดอร์ โดยตรวจสอบตำแหน่งจัดส่งก่อนเริ่มชำระเงิน
- **Verification intent (derived, not a new decision):** ที่อยู่นอกระยะถูกปฏิเสธก่อน Checkout; ค่าส่งมาจากตั้งค่าร้าน

### VLP-016 — Manual Delivery Status and ETA

- **Source / approved decision:** Scope 16 · **B**
- **Approved requirement:** การจัดส่งโดยร้านมีสถานะการจัดส่งและเวลาคาดการณ์ที่เจ้าของร้านอัปเดตได้ ไม่มี GPS ติดตามไรเดอร์แบบเรียลไทม์
- **Verification intent (derived, not a new decision):** ลูกค้าเห็นสถานะ/ETA ที่ร้านอัปเดต; ไม่บังคับ GPS Tracking

### VLP-017 — Real-Time Web and Optional Browser Push

- **Source / approved decision:** Scope 17 · **B**
- **Approved requirement:** ออเดอร์/คิว/สถานะแจ้งเตือนผ่านเว็บไซต์แบบ Real-Time และ Browser Push เมื่อได้รับอนุญาต มีเสียงหรือการแจ้งเตือนใน Dashboard ร้าน ไม่มี LINE Notification
- **Verification intent (derived, not a new decision):** สถานะอัปเดตบนเว็บได้แม้ปิด Push; ไม่ต้องมี LINE Integration

### VLP-018 — Persistent Table QR and Sessions

- **Source / approved decision:** Scope 18 · **B**
- **Approved requirement:** โต๊ะมี QR แบบคงที่ที่ผูกหมายเลขโต๊ะกับร้าน เมื่อลูกค้าสแกนจะดูเมนูและเลือกโหมด Dine-in/Takeaway ตาม Flow ที่กำหนด รองรับหลายออเดอร์ชำระเงินแยกกันบนโต๊ะเดียวและจัดคิว FIFO ตามแต่ละออเดอร์ ต้องป้องกันข้อมูลลูกค้า/เซสชันเดิมรั่วไหล
- **Verification intent (derived, not a new decision):** QR ระบุโต๊ะถูกต้อง; สร้างหลายออเดอร์แยก payment/queue ได้; session ใหม่ไม่เห็นข้อมูลเดิมที่ไม่เกี่ยวข้อง

## Part II — Analytics, Discovery, Experience and Restaurant Operations

### VLP-019 — Advanced Restaurant Analytics

- **Source / approved decision:** Scope 19 · **C**
- **Approved requirement:** ร้านมี Dashboard และรายงานยอดขาย ตัวกรองช่วงเวลา สินค้าขายดี การยกเลิก Refund ช่วงเวลายุ่ง ลูกค้าซื้อซ้ำเมื่อมีข้อมูลยืนยันตัวตน ประสิทธิภาพคิว และแนวโน้ม รองรับส่งออก CSV/Excel; ไม่อ้างว่าคำนวณกำไรสุทธิหากไม่มีต้นทุนสินค้า
- **Verification intent (derived, not a new decision):** แสดงสถิติจากข้อมูลธุรกรรมที่ตรวจสอบได้และแยกร้าน; CSV/Excel Export; ไม่มี Net Profit จากข้อมูลที่ไม่มี COGS

### VLP-020 — Advanced Platform Admin Operations

- **Source / approved decision:** Scope 20 · **C**
- **Approved requirement:** Platform Admin จัดการผู้ใช้ ตรวจอนุมัติร้าน ตลาด/ชุมชน ข้อพิพาท ความเสี่ยง/การทุจริต Audit และกำกับโฆษณา/การโปรโมตได้
- **Verification intent (derived, not a new decision):** ผู้ดูแลมีสิทธิ์ตามบทบาทและ Audit Trail; ไม่เข้าถึงธุรกรรมร้านอื่นโดยไม่มีสิทธิ์

### VLP-021 — Advanced Sponsored Ads Platform

- **Source / approved decision:** Scope 21 · **C**
- **Approved requirement:** ร้านซื้อแคมเปญโปรโมตได้ กำหนดงบ ระยะเวลา การกำหนดกลุ่ม/พื้นที่ ตำแหน่งแสดงโฆษณา วัด Impression/Click/Conversion และต้องผ่าน Admin Review มีป้าย Sponsored ชัดเจน รายได้โฆษณาจ่ายให้ VELOPOS แยกจากเงินอาหาร
- **Verification intent (derived, not a new decision):** แคมเปญต้องผ่านการอนุมัติ; โฆษณาเห็น Sponsored; วอลเล็ตโฆษณาไม่ใช่เงินอาหาร

### VLP-022 — AI Customer Shopping Assistant

- **Source / approved decision:** Scope 22 · **C**
- **Approved requirement:** AI Chat Assistant ช่วยค้นหา/เปรียบเทียบ/แนะนำร้านและเมนูจากข้อมูลจริง เช่น ราคา คิว ความพร้อมขาย ช่วยเลือก Modifier และเพิ่มลงตะกร้าร้านเดียวได้ แต่ลูกค้าต้องยืนยันและชำระเงินเอง ต้องระบุ Sponsored ที่เกี่ยวข้องอย่างโปร่งใส
- **Verification intent (derived, not a new decision):** AI ไม่สร้างคำสั่งซื้อ/ชำระเอง; ไม่เสนอเมนูที่ไม่มีจริงหรือแฝงโฆษณาเป็น Organic

### VLP-023 — No LINE Integration

- **Source / approved decision:** Scope 23 · **D**
- **Approved requirement:** ไม่รวม LINE Ordering, LIFF, LINE Chat หรือ LINE Notification ในขอบเขต VELOPOS ที่อนุมัติ
- **Verification intent (derived, not a new decision):** การสั่งอาหารและแจ้งเตือนทำงานผ่านช่องทางแพลตฟอร์มเอง ไม่พึ่ง LINE

### VLP-024 — Verified Order Reviews

- **Source / approved decision:** Scope 24 · **B**
- **Approved requirement:** ลูกค้ารีวิวร้านด้วยคะแนน 1–5 ดาวและข้อความได้เฉพาะออเดอร์ที่ Completed จริง รองรับสมาชิกและ Guest ผ่าน Token ปลอดภัย จำกัดหนึ่งรีวิวต่อออเดอร์ โดยไม่กำหนดรูปภาพรีวิวหรือการตอบกลับของร้านเป็นข้อบังคับ
- **Verification intent (derived, not a new decision):** ไม่เปิดรีวิวออเดอร์ Pending/No-Show; ออเดอร์เดียวรีวิวได้ครั้งเดียว

### VLP-025 — Customer Profile and Favorites

- **Source / approved decision:** Scope 25 · **B**
- **Approved requirement:** สมาชิกมีโปรไฟล์ ประวัติออเดอร์ ที่อยู่ รายการร้าน/เมนูโปรด และ Reorder โดยตรวจสอบราคา/สถานะเมนูใหม่; ไม่ยกเลิก Guest Checkout
- **Verification intent (derived, not a new decision):** สมาชิกจัดการข้อมูลตนและ Favorites ได้; Reorder ไม่ใช้ราคาเก่าโดยอัตโนมัติ

### VLP-026 — Advanced Marketplace Search and Geo Filters

- **Source / approved decision:** Scope 26 · **B**
- **Approved requirement:** ค้นหาด้วยข้อความ หมวดหมู่ ตลาด/ชุมชน ตำแหน่งที่ผู้ใช้ยินยอม ระยะทาง ราคา รีวิว สถานะเปิดร้าน Delivery และความหนาแน่น/คิว โดยไม่บังคับมีหน้าสำรวจแผนที่เต็มรูปแบบ
- **Verification intent (derived, not a new decision):** ไม่ใช้พิกัดหากไม่มีสิทธิ์; ผลค้นหาคำนึงถึงพื้นที่และ Filter; ไม่มี Map Explorer เป็นข้อบังคับ

### VLP-027 — Controlled Storefront Customization

- **Source / approved decision:** Scope 27 · **B**
- **Approved requirement:** ร้านปรับรูปแบบหน้าร้านในขอบเขต Design System กลาง เช่น สีที่อนุญาต แบนเนอร์ แกลเลอรี เมนูแนะนำ และลำดับ Section โดยไม่สร้างธีมอิสระไร้ข้อจำกัด
- **Verification intent (derived, not a new decision):** แต่ละร้านปรับข้อมูลการนำเสนอได้โดยไม่ทำลาย UX/Accessibility กลาง

### VLP-028 — Dynamic Wait ETA

- **Source / approved decision:** Scope 28 · **B**
- **Approved requirement:** คำนวณและแสดงเวลารอคาดการณ์จากคิว FIFO ปริมาณงานและประวัติ แสดงก่อนและหลังการสั่ง โดยยังไม่มีระบบ Auto-Close รับออเดอร์เมื่อคิวเต็ม
- **Verification intent (derived, not a new decision):** ETA เปลี่ยนตามภาระงาน; ไม่ปิดรับตามเกณฑ์คิวอัตโนมัติ

### VLP-029 — ASAP Orders Only

- **Source / approved decision:** Scope 29 · **A**
- **Approved requirement:** รองรับการสั่งล่วงหน้าเพื่อรับเมื่ออาหารพร้อม แต่ไม่กำหนดเวลารับในอนาคตแบบ Scheduled Pickup
- **Verification intent (derived, not a new decision):** Checkout ไม่มีการจองช่วงเวลารับล่วงหน้าเป็นข้อบังคับ

### VLP-030 — Verified Handover by Channel

- **Source / approved decision:** Scope 30 · **B**
- **Approved requirement:** ยืนยันการส่งมอบตามช่องทาง: Dine-in ยืนยันอาหารถึงโต๊ะ, Takeaway/Pickup ใช้ QR/รหัสเฉพาะออเดอร์, Delivery ใช้รหัสยืนยันจากลูกค้า บันทึกหลักฐานและเวลาการส่งมอบ
- **Verification intent (derived, not a new decision):** การส่งมอบผูก Order/Channel ถูกต้องและป้องกันการยืนยันซ้ำ

### VLP-031 — Single Owner per Restaurant; No Staff Module

- **Source / approved decision:** Scope 31 · **A**
- **Approved requirement:** ร้านหนึ่งมีบัญชี Owner ได้เพียงหนึ่งบัญชี เจ้าของดูแลหลายร้านแยกกันได้ ไม่มีโมดูลพนักงานหรือบทบาท Co-owner ในขอบเขตปัจจุบัน
- **Verification intent (derived, not a new decision):** สิทธิ์ Owner ร้านเดียวพร้อมกันหนึ่งบัญชี; ไม่มี Staff CRUD/RBAC เป็นฟีเจอร์ที่อนุมัติ

### VLP-032 — Global and Sales-Mode Pause

- **Source / approved decision:** Scope 32 · **B**
- **Approved requirement:** ร้านควบคุม Pause ทั้งร้านหรือแยกตาม Dine-in, Takeaway, Pickup และ Delivery ได้ร่วมกับตารางเวลาเปิดร้าน ออเดอร์ที่ Paid แล้วต้องทำต่อ
- **Verification intent (derived, not a new decision):** Pause เฉพาะช่องทางไม่ปิดช่องทางอื่น; คิว Paid ไม่ถูกลบ

### VLP-033 — Admin Community/Market/Category Registry

- **Source / approved decision:** Scope 33 · **B**
- **Approved requirement:** Platform Admin ดูแลทะเบียนตลาด ชุมชน และหมวดหมู่กลาง ร้านส่งคำขอเพิ่มรายการใหม่ได้แต่ต้องรอ Admin ตรวจสอบก่อนนำมาใช้
- **Verification intent (derived, not a new decision):** ค่ากลางสร้างโดย Admin; คำขอใหม่ร้านไม่เผยแพร่ทันที

### VLP-034 — One Real Restaurant Location and Primary Market

- **Source / approved decision:** Scope 34 · **B**
- **Approved requirement:** ร้านหนึ่งมีสถานที่จริงแห่งเดียวและตลาดหลักหนึ่งแห่ง แต่ขอให้แสดงในหลายชุมชนหรือพื้นที่ค้นพบได้หาก Admin อนุมัติ ห้ามสร้างที่ตั้งปลอมหรือคิว/ร้านซ้ำ และระยะจัดส่งใช้พิกัดจริงของร้าน
- **Verification intent (derived, not a new decision):** ร้านหนึ่งมีพิกัดจริงหนึ่งแห่ง; แสดงหลาย Community ไม่สร้าง Order/Queue ซ้ำ

## Part III — Business Model, Safety, Infrastructure and Access

### VLP-035 — Free/Pro Subscription plus Separate Ads Revenue

- **Source / approved decision:** Scope 35 · **B**
- **Approved requirement:** โมเดลธุรกิจ VELOPOS ไม่มีค่าธรรมเนียมต่อออเดอร์ค่าอาหาร ร้านใช้ Free หรือ Pro Subscription และซื้อโฆษณาเพิ่มได้ โดยรายได้โฆษณา/Pro จ่ายให้แพลตฟอร์มแยกจากเงินอาหาร
- **Verification intent (derived, not a new decision):** ไม่หักเปอร์เซ็นต์อาหารโดยแพลตฟอร์ม; Billing รายได้แพลตฟอร์มแยกจาก Food Payment

### VLP-036 — Hybrid Pro/Ads Billing

- **Source / approved decision:** Scope 36 · **C**
- **Approved requirement:** การชำระค่า Pro และโฆษณาของแพลตฟอร์มใช้การยืนยัน PromptPay ผ่าน Provider เป็นหลัก พร้อมทางเลือกให้ Admin ตรวจสอบการชำระด้วยตนเองกรณีจำเป็น มีประวัติรายการและ Admin อนุมัติแคมเปญหลังจ่าย
- **Verification intent (derived, not a new decision):** ไม่เปิด Ads ก่อนเงื่อนไขจ่าย/อนุมัติครบ; Manual fallback ต้องมี Audit

### VLP-037 — Feature-Based Free and Pro Plans

- **Source / approved decision:** Scope 37 · **A**
- **Approved requirement:** Free มีฟีเจอร์หลักของร้านครบ เช่น เมนู ออเดอร์ QR โต๊ะ FIFO ครัว รับชำระ Pickup/Delivery และ Dashboard พื้นฐาน ส่วน Pro เน้น Analytics/Reports ขั้นสูงและ Storefront ขั้นสูง ทั้งสองแผนซื้อ Ads เพิ่มได้ รายการสิทธิ์ย่อยละเอียดจะกำหนดภายหลัง
- **Verification intent (derived, not a new decision):** Free ต้องยังขายอาหารได้ครบ; ไม่ทำให้ Payment/FIFO เป็น Pro-only

### VLP-038 — Monthly/Yearly Pro with Manual Renewal

- **Source / approved decision:** Scope 38 · **B**
- **Approved requirement:** Pro สมัครเป็นรอบเดือนหรือปี ต่ออายุด้วยการชำระแบบ Manual Renewal ไม่ตัดเงินอัตโนมัติ แจ้งก่อนหมดอายุ และลดระดับเป็น Free โดยรักษาข้อมูลร้านเดิม; ราคาและรอบแจ้งเตือนยังไม่กำหนด
- **Verification intent (derived, not a new decision):** เมื่อ Pro หมดอายุไม่ลบข้อมูล; ไม่มี Auto Charge

### VLP-039 — Hybrid Fixed-Price and CPC/CPM Advertising

- **Source / approved decision:** Scope 39 · **C**
- **Approved requirement:** โฆษณารองรับทั้งแบบราคาคงที่และ CPC/CPM พร้อม Budget/Duration/Tracking ภายใต้การตรวจสอบของ Admin กฎอัตราและการหักเงินละเอียดต้องออกแบบเพิ่มเติม
- **Verification intent (derived, not a new decision):** แคมเปญใช้ Pricing Model ที่กำหนด; ค่าใช้จ่ายต้องตรวจสอบได้และไม่เกินงบ

### VLP-040 — Clearly Labeled Sponsored Placement

- **Source / approved decision:** Scope 40 · **B**
- **Approved requirement:** แสดง Sponsored ได้บน Homepage, หน้า Market/Community และพื้นที่ Search ตามความเกี่ยวข้อง พื้นที่ สถานะร้าน และความพร้อมขาย ต้องติดป้ายชัดเจน ไม่เปลี่ยนอันดับผล Organic แบบแอบแฝงหรือแฝงใน AI Recommendation
- **Verification intent (derived, not a new decision):** Organic Ranking ไม่ถูกซื้ออันดับอย่างไม่เปิดเผย; Sponsored มี Label เสมอ

### VLP-041 — Prepaid Advertising Wallet and Immutable Ledger

- **Source / approved decision:** Scope 41 · **B**
- **Approved requirement:** ร้านเติมเครดิตโฆษณาล่วงหน้า แยกยอดใช้งานได้และยอดจองตามแคมเปญ หักใช้จ่ายแบบ Atomic คืนยอดจองที่ไม่ได้ใช้ได้ และบันทึก Wallet Ledger แบบตรวจสอบย้อนหลังได้ แยกจากเงินอาหาร
- **Verification intent (derived, not a new decision):** ห้ามใช้เครดิตเกินยอดคงเหลือ; ไม่มี Double Spend; ห้ามหักอาหารจาก Ad Wallet

### VLP-042 — Ad Conversion Attribution and ROAS Reporting

- **Source / approved decision:** Scope 42 · **B**
- **Approved requirement:** รายงาน Impression, Click, CTR, Attributed Paid Orders, Attributed Revenue, Conversion และ ROAS โดยคำนึงถึงสิทธิ์ความเป็นส่วนตัว และปรับตัวเลข Attribution เมื่อเกิด Refund; ไม่รวม Cross-Device Attribution ขั้นสูง
- **Verification intent (derived, not a new decision):** Conversion ต้องเชื่อมออเดอร์ที่จ่ายจริงและไม่ Double Count; Refund ปรับรายงาน

### VLP-043 — Refund Unused Advertising Wallet Credits

- **Source / approved decision:** Scope 43 · **B**
- **Approved requirement:** ร้านขอคืนเครดิตโฆษณาที่ไม่ใช้ได้ ระบบล็อกยอดที่ขอคืนระหว่างตรวจสอบ Admin ตรวจสอบและดำเนินการโอนเงินคืนด้วยตนเองพร้อมหลักฐาน/Audit แยกจาก Food Refund
- **Verification intent (derived, not a new decision):** ไม่สามารถใช้ยอดที่ล็อกซ้ำ; สถานะคืนเครดิตเชื่อม Ledger และผู้ดำเนินการ

### VLP-044 — Support Tickets and Dispute Workflow

- **Source / approved decision:** Scope 44 · **B**
- **Approved requirement:** ลูกค้าและร้านสร้าง Support Ticket แยกประเภทเชื่อม Order/Restaurant แนบหลักฐาน โต้ตอบข้อความ และติดตามสถานะได้ Admin ตรวจสอบพร้อม Audit; Guest ใช้สิทธิ์เข้าถึงอย่างปลอดภัย แพลตฟอร์มไม่สามารถดึงเงินค่าอาหารจากร้านได้เอง
- **Verification intent (derived, not a new decision):** Tickets ผูกเจ้าของสิทธิ์และหลักฐาน; Admin ทำ Case Review ไม่ถือเงินอาหาร

### VLP-045 — Rule-Based Fraud Detection with Security Controls

- **Source / approved decision:** Scope 45 · **B**
- **Approved requirement:** ใช้การตรวจจับความผิดปกติตามกฎสำหรับการจ่ายเงิน ออเดอร์ โฆษณา Wallet และการเข้าถึง พร้อม Admin Alerts; รักษา Authentication/RBAC/Tenant Isolation, Rate Limiting, Callback Verification, Atomic Ledger และ Audit ไม่ต้องมี ML Fraud Engine
- **Verification intent (derived, not a new decision):** กฎตรวจจับเหตุผิดปกติได้; ไม่มีการข้าม Provider Verification หรือ RBAC

### VLP-046 — Privacy Data Lifecycle Management

- **Source / approved decision:** Scope 46 · **B**
- **Approved requirement:** กำหนดตารางเก็บข้อมูลตามประเภท จัดการคำขอเข้าถึง/แก้ไข/ลบข้อมูล ลบหรือทำข้อมูลไม่ระบุตัวตนตามเงื่อนไข และเก็บหลักฐาน Payment/Transactions/Disputes ที่จำเป็นตามกฎหมายและนโยบาย ระยะเวลาจริงยังต้องกำหนด
- **Verification intent (derived, not a new decision):** สิทธิ์ลบไม่ทำลายหลักฐานที่ต้องเก็บ; มี Data Retention Schedule ที่ตรวจสอบได้

### VLP-047 — PITR Backup and Disaster Recovery

- **Source / approved decision:** Scope 47 · **B**
- **Approved requirement:** สำรองฐานข้อมูลและระบบอย่างปลอดภัยแบบเข้ารหัส แยกที่เก็บ รองรับ Point-in-Time Recovery ทดสอบการกู้คืน และตรวจสอบความสอดคล้องของ Orders, Payments, FIFO และ Wallet หลัง Restore; RPO/RTO ยังไม่กำหนด ไม่มีการบังคับทำ Automatic HA Failover
- **Verification intent (derived, not a new decision):** มี Restore Drill/Recovery Validation; Reconcile ธุรกรรมหลัง Restore

### VLP-048 — Full Observability

- **Source / approved decision:** Scope 48 · **B**
- **Approved requirement:** เก็บ Centralized Logs, Metrics, Distributed Tracing, Dashboards และ Alerts สำหรับ Payment, Orders, Queue, Wallet, Backup และ API โดยปกป้อง PII และ Secrets
- **Verification intent (derived, not a new decision):** เหตุผิดปกติสำคัญมี Monitoring/Alert; ไม่มี Secret/PII อันตรายใน Logs

### VLP-049 — Controlled CI/CD Rolling Release

- **Source / approved decision:** Scope 49 · **B**
- **Approved requirement:** Pipeline ทำ Automated Tests, Security Checks และ Staging Validation ก่อนปล่อย Production ด้วย Manual Approval รองรับ Rolling Deployment, Health Check/Rollback ของแอป, Backward-Compatible Database Migrations, Idempotency และ Reconciliation
- **Verification intent (derived, not a new decision):** ไม่มี Auto Production Deploy โดยไร้อนุมัติ; Migration ปลอดภัยย้อนหลังและ rollback plan

### VLP-050 — Multi-Community Scaling and Load Validation

- **Source / approved decision:** Scope 50 · **B**
- **Approved requirement:** ออกแบบเพื่อขยายจำนวนร้าน/ชุมชนด้วย Horizontal Scaling, Cache, Workers และ Database Optimization พร้อม Load/Stress Testing เป้าหมายออกแบบเบื้องต้นราว 1,000 ร้าน, 5,000 Concurrent Users และ 10,000 Orders/Day ยังไม่ใช่ผลทดสอบหรือรับประกัน
- **Verification intent (derived, not a new decision):** มีแผนทดสอบและ Capacity Metrics; ไม่อ้างผ่านเป้าหมายก่อนทดสอบจริง

### VLP-051 — Controlled Partner Read API and Webhooks

- **Source / approved decision:** Scope 51 · **B**
- **Approved requirement:** พาร์ตเนอร์ที่ได้รับอนุมัติสามารถอ่านข้อมูลร้าน เมนู และสถานะออเดอร์เท่าที่ได้รับสิทธิ์ ผ่าน API/Webhooks พร้อม Credentials, Scopes, Rate Limits และ Audit ไม่เปิดให้บุคคลภายนอกสร้างออเดอร์ผ่าน API และไม่มี LINE
- **Verification intent (derived, not a new decision):** Partner credential แยกสิทธิ์; ไม่อนุญาต Write Order จาก External Partner

### VLP-052 — Thai/English Bilingual Platform

- **Source / approved decision:** Scope 52 · **B**
- **Approved requirement:** รองรับภาษาไทยและอังกฤษทั่วระบบ ร้านกรอกชื่อ/รายละเอียดเมนูสองภาษาได้ ถ้าไม่มีภาษาอังกฤษให้ใช้ภาษาไทยเป็น Fallback ใช้ THB เท่านั้น ไม่บังคับ AI Auto-Translation
- **Verification intent (derived, not a new decision):** Language Switch ทำงานทุกหน้าหลัก; ข้อมูลไม่มี EN แสดง Thai Fallback

### VLP-053 — Responsive plus WCAG 2.2 AA Target

- **Source / approved decision:** Scope 53 · **B**
- **Approved requirement:** ออกแบบ Customer, Restaurant และ Admin ให้รองรับ Mobile/Tablet/Desktop และตั้งเป้า Accessibility WCAG 2.2 AA เช่น Keyboard, Screen Reader, Focus, Contrast, Form Validation พร้อมทดสอบ ไม่อ้างการรับรองโดยไม่มีผลตรวจ
- **Verification intent (derived, not a new decision):** ฟังก์ชันหลักใช้งานด้วย Keyboard และ Screen Reader ได้ตามเกณฑ์ที่ทดสอบ

### VLP-054 — Installable PWA and Offline Read-Only Cache

- **Source / approved decision:** Scope 54 · **B**
- **Approved requirement:** รองรับการติดตั้งเป็น PWA และอ่านข้อมูลสาธารณะที่ Cache ไว้เมื่อ Offline อย่างจำกัด แต่การสร้างออเดอร์ จ่ายเงิน และเปลี่ยนสถานะคิวต้อง Online และ Server Revalidation; ทำ Cache Cleanup เมื่อ Logout
- **Verification intent (derived, not a new decision):** Offline ไม่กดชำระ/สั่งจริงสำเร็จ; ไม่ Cache ข้อมูลส่วนตัวผิดสิทธิ์

## Part IV — Receipts, Promotions, Payments, Trust and Loyalty

### VLP-055 — Browser/PDF Printing

- **Source / approved decision:** Scope 55 · **B**
- **Approved requirement:** พิมพ์รายการรับออเดอร์ Kitchen Ticket และใบรับเงิน/ใบเสร็จด้วย Browser Print หรือ PDF ไม่มี Direct Thermal Printer Integration หรือ Auto Print ใน Scope และการพิมพ์ต้องไม่เปลี่ยนสถานะออเดอร์
- **Verification intent (derived, not a new decision):** พิมพ์ได้โดยไม่เกิด Side Effect ต่อธุรกรรม

### VLP-056 — Standard Sales Receipt Management

- **Source / approved decision:** Scope 56 · **B**
- **Approved requirement:** ร้านมีเลขใบรับเงิน/ใบเสร็จอ้างอิงธุรกรรม แสดงรายการสินค้า ยอดจ่าย ส่วนลด ค่าส่ง และการอ้างอิง Cancel/Refund รองรับ PDF/Browser Print ไม่รวมใบกำกับภาษีเต็มรูปหรือ e-Tax และห้ามแสดง Paid ก่อน Provider ยืนยัน
- **Verification intent (derived, not a new decision):** Receipt อ้างอิงเฉพาะรายการจ่ายยืนยันแล้ว; Refund ไม่ลบใบเสร็จเดิม

### VLP-057 — Standard Restaurant Promotions and Coupons

- **Source / approved decision:** Scope 57 · **B**
- **Approved requirement:** ร้านสร้างราคาพิเศษตามช่วงเวลา ส่วนลดจำนวนเงิน/เปอร์เซ็นต์ คูปอง เงื่อนไขขั้นต่ำ เมนูที่ร่วมรายการ ช่วงเวลา และข้อจำกัดจำนวนครั้ง/รายคน ตรวจสอบและจองสิทธิ์แบบ Atomic ที่ Backend ไม่บังคับโปรโมชัน Buy-X-Get-Y ขั้นสูง
- **Verification intent (derived, not a new decision):** คูปองใช้เกินสิทธิ์ไม่ได้; Checkout คำนวณราคาจาก Backend

### VLP-058 — Restaurant-Specific Loyalty Points

- **Source / approved decision:** Scope 58 · **B**
- **Approved requirement:** สมาชิกได้รับแต้มจากออเดอร์อาหารที่ Paid และ Completed ตามอัตรา/อายุแต้มของแต่ละร้าน แลกแต้มเป็นส่วนลดได้ แต้มร้านแยก Ledger และปรับเมื่อ Cancel/Refund Guest ยังสั่งได้โดยไม่ต้องสะสม
- **Verification intent (derived, not a new decision):** ไม่ใช้แต้มข้ามร้าน; ไม่ Earn ก่อน Completed; Ledger ตรวจสอบได้

### VLP-059 — Discounted Price with One Additional Benefit

- **Source / approved decision:** Scope 59 · **B**
- **Approved requirement:** ราคาสินค้าที่ลดตาม Promotion สามารถรวมกับ Coupon หนึ่งรายการ หรือการแลก Points อย่างใดอย่างหนึ่งเท่านั้น ห้าม Coupon+Points พร้อมกันหรือซ้อนหลาย Coupon ระบบคิดยอดสุทธิโดย Backend และปล่อยสิทธิ์เมื่อ Unpaid ที่ยืนยันแล้ว แต้ม Earn บนยอดค่าอาหารสุทธิที่มีสิทธิ์ ไม่รวมค่าส่ง
- **Verification intent (derived, not a new decision):** คูปองและแต้มไม่ Stack กัน; Refund/Failure มี Atomic Reservation Rollback

### VLP-060 — Advanced In-App Customer–Restaurant Chat

- **Source / approved decision:** Scope 60 · **C**
- **Approved requirement:** ลูกค้าและร้านติดต่อกันทั้งก่อนและหลังสั่งอาหารผ่าน In-App Chat รองรับข้อความ รูปภาพ/ไฟล์แนบ ประวัติ และ Admin Moderation/Reports โดยรักษา Tenant/Guest Privacy; แยกจาก AI Assistant และ Support Disputes; ไม่มี LINE
- **Verification intent (derived, not a new decision):** ข้อความเข้าถึงได้เฉพาะคู่สนทนาที่ได้รับอนุญาต; รายงานแชตให้ Admin ตรวจสอบได้

### VLP-061 — Controlled Post-Payment Order Amendment

- **Source / approved decision:** Scope 61 · **B**
- **Approved requirement:** ก่อน Preparing เท่านั้น ร้านเสนอแก้เมนูด้วยการแทนที่หรือเอาออก โดยยอดใหม่ห้ามมากกว่าเดิม ลูกค้าต้องอนุมัติ หากยอดลด ร้านคืนส่วนต่างเองและบันทึก Ledger/Refund ปรับ Coupon/Points อย่างถูกต้อง ยังคงเวลาเข้าคิว FIFO เดิม; หลัง Preparing ไม่มี Routine Amendment
- **Verification intent (derived, not a new decision):** ร้านแก้ Paid Order ไม่ได้ฝ่ายเดียว; ไม่มีการเรียกเก็บเพิ่ม; FIFO Timestamp ไม่เปลี่ยน

### VLP-062 — Fixed Global Payment Timeout

- **Source / approved decision:** Scope 62 · **A**
- **Approved requirement:** ใช้กรอบเวลารอชำระเงินมาตรฐานเดียวทั่วแพลตฟอร์ม ร้านปรับเองไม่ได้ จำนวนที่แน่นอนยังไม่กำหนด (15 นาทีเคยเป็นเพียงตัวอย่าง) Pending ไม่เข้าคิว ต้องตรวจสอบ Provider ก่อน Expire และปล่อย Coupon/Points/Quota เมื่อยืนยัน Unpaid เท่านั้น Unknown ไป Reconciliation
- **Verification intent (derived, not a new decision):** ร้านเปลี่ยน Timeout ไม่ได้; ไม่คืน Reservation หาก Payment Unknown

### VLP-063 — Automated Payment Reconciliation plus Manual Exceptions

- **Source / approved decision:** Scope 63 · **B**
- **Approved requirement:** ระบบตรวจสอบสถานะ Provider เป็นรอบเพื่อกู้รายการ Callback หาย/ช้า และ Payment Pending/Timeout ได้อย่างปลอดภัย รายการที่จ่ายภายในหน้าต่างที่อนุญาตต้องกู้ Paid Order เดิมได้โดยไม่ซ้ำ รายการ Late Paid หรือผลไม่ชัดเจนเข้าสู่ Merchant/Admin Investigation และ Refund หากต้องดำเนินการ
- **Verification intent (derived, not a new decision):** Recovery ไม่สร้าง Order/FIFO ซ้ำ; เก็บเวลาจ่ายจริงและเหตุผิดปกติสำหรับสอบสวน

### VLP-064 — Structured Food Refund Workflow and Escalation

- **Source / approved decision:** Scope 64 · **B**
- **Approved requirement:** มี Refund Reference สำหรับ Full/Partial Refund, กำหนด Deadline ตามนโยบาย, Reminders, Overdue Alerts และ Admin Escalation ลูกค้าแจ้งไม่ได้รับเงินผ่าน Support ได้ ร้านอาหารเป็นผู้โอนคืนเองพร้อมหลักฐาน; สถานะร้านแจ้งโอนแล้วไม่พิสูจน์ว่าลูกค้าได้รับเงินแน่
- **Verification intent (derived, not a new decision):** Refund มี Reference/Deadline/Audit; Platform ไม่คืนเงินค่าอาหารแทนร้าน; Dispute เปิดได้แม้มี Slip

### VLP-065 — Verified Restaurant Onboarding

- **Source / approved decision:** Scope 65 · **B**
- **Approved requirement:** Admin ตรวจสอบหลักฐานตัวตนเจ้าของร้าน ที่ตั้งจริง ข้อมูลร้าน และความสัมพันธ์ระหว่างผู้ขายกับบัญชีรับเงินก่อนอนุมัติร้านแยกกัน; เมื่อเปลี่ยนข้อมูลสำคัญต้อง Re-verification; เก็บเอกสารอย่างจำกัดสิทธิ์และอายุข้อมูลที่เหมาะสม ไม่สมมติว่าทุกร้านต้องจดทะเบียนธุรกิจ/ภาษีแบบเดียวกัน
- **Verification intent (derived, not a new decision):** ร้าน Pending Verified ขายไม่ได้; เปลี่ยนบัญชีรับเงินต้องตรวจสอบก่อนเปิดใช้

### VLP-066 — Structured Suspension and Appeal

- **Source / approved decision:** Scope 66 · **B**
- **Approved requirement:** Platform Admin ออก Warning, Temporary Suspension หรือ Revocation ตามระดับปัญหา พร้อมเหตุผล/หลักฐาน/Audit ร้านอุทธรณ์หรือแก้ไขเพื่อรับ Admin Re-approval; ร้านที่ระงับหยุดรับออเดอร์/จ่ายใหม่และ Ads ที่ไม่ควรหักเพิ่ม แต่ต้องรักษา Paid Orders, Refunds, Support และ Ad Wallet
- **Verification intent (derived, not a new decision):** Suspended ไม่รับออเดอร์ใหม่; ประวัติ/ภาระคงอยู่; มี Appeal Trail

### VLP-067 — Admin-Verified Ownership Transfer and Secure Recovery

- **Source / approved decision:** Scope 67 · **B**
- **Approved requirement:** รองรับกู้บัญชีและโอนสิทธิ์ Owner ร้านให้คนใหม่เมื่อ Admin ตรวจสอบตัวตน สิทธิ์ในการโอน และบัญชีรับเงินใหม่ก่อนอนุมัติ ร้านหนึ่งมี Owner เพียงหนึ่งบัญชี ณ เวลาเดียวกัน เพิกถอนสิทธิ์/Session เดิมอย่างปลอดภัยและเก็บ Audit; การโอนไม่โอนยอดในธนาคารหรือภาระย้อนหลังโดยอัตโนมัติ
- **Verification intent (derived, not a new decision):** ไม่มี Owner สองคนพร้อมกัน; ไม่เปลี่ยนบัญชีรับเงินข้าม Verification

### VLP-068 — Structured Restaurant Closure and Archival

- **Source / approved decision:** Scope 68 · **B**
- **Approved requirement:** เจ้าของร้านยื่นปิดกิจการผ่าน Dashboard แล้วหยุดออเดอร์ใหม่ ตรวจสอบ/จัดการ Paid Orders, Refunds, Support Tickets, Ads Campaign/Wallet และ Pro ก่อน Admin Archive ร้าน; ไม่ลบหลักฐานหรือปลดภาระโดยอัตโนมัติ; Reopen ต้อง Admin Re-approval
- **Verification intent (derived, not a new decision):** Archived ไม่ขายได้แต่ประวัติจำเป็นยังอยู่; Refund/Support ค้างดำเนินการได้

### VLP-069 — Comprehensive Restaurant Data Export

- **Source / approved decision:** Scope 69 · **B**
- **Approved requirement:** เจ้าของส่งออกเฉพาะข้อมูลร้านที่มีสิทธิ์ ได้แก่ เมนู หมวดหมู่ ราคา ประวัติออเดอร์ รายงาน โปรโมชัน รีวิว และโปรไฟล์ธุรกิจใน CSV/Excel/JSON ตามประเภทข้อมูล รองรับดาวน์โหลดเป็นชุด ประวัติคำขอ และ Privacy Controls เช่น PII Redaction, Tenant Isolation, Auth/Audit, ลิงก์หมดอายุ
- **Verification intent (derived, not a new decision):** Export ไม่มีข้อมูลข้ามร้านหรือข้อมูลลูกค้าเกินสิทธิ์; ไม่ลบข้อมูลต้นฉบับ

### VLP-070 — Role-Based Authentication Security and Recovery

- **Source / approved decision:** Scope 70 · **B**
- **Approved requirement:** ลูกค้ามี Email/Password และ Social Login พร้อม Guest Checkout; มี Email Verification, Password Recovery และ Session Management; Owner/Admin บังคับ MFA และ Re-auth ก่อน Sensitive Actions เช่น บัญชีรับเงิน โอนร้าน คืนเครดิตโฆษณา; Secure Recovery ต้องไม่ให้ Password Reset ข้าม MFA ได้; Backend ใช้ RBAC/Tenant Isolation
- **Verification intent (derived, not a new decision):** Owner/Admin เปลี่ยน Sensitive Data โดยไม่ผ่าน Re-auth ไม่ได้; Guest ไม่บังคับสมัคร

### VLP-071 — Secure Guest Order Claiming

- **Source / approved decision:** Scope 71 · **B**
- **Approved requirement:** สมาชิกเชื่อมออเดอร์ Guest เดิมเข้าบัญชีทีละออเดอร์ด้วยหลักฐานการครอบครองออเดอร์หรือ Token ที่ปลอดภัย เลขออเดอร์/อีเมล/เบอร์ติดต่อที่ตรงกันอย่างเดียวไม่พอ ป้องกัน Claim ซ้ำ ไม่เปลี่ยนสถานะชำระ ไม่สร้างรีวิวหรือ Loyalty Points ย้อนหลังอัตโนมัติ
- **Verification intent (derived, not a new decision):** Order ถูก Claim โดยผู้มีสิทธิ์ครั้งเดียว; Claim ไม่เพิ่มแต้มเอง

### VLP-072 — Verified Retroactive Loyalty Request

- **Source / approved decision:** Scope 72 · **B**
- **Approved requirement:** หลัง Secure Guest Claim สมาชิกกดขอแต้มจาก Guest Order ย้อนหลังได้ภายในช่วงเวลา Policy ที่ยังไม่กำหนด ระบบตรวจ Paid, Completed, Refund/ยอดสุทธิ และตรวจไม่เคยให้แต้มออเดอร์นั้นก่อน มี Atomic/Idempotent Points Ledger แยกร้าน; ไม่เพิ่มแต้มจากการ Claim อัตโนมัติ
- **Verification intent (derived, not a new decision):** คำขอครั้งที่สองไม่ให้แต้มซ้ำ; Refund กระทบสิทธิ์อย่างถูกต้อง

### VLP-073 — Batch Points Ledger, FEFO, and Automatic Reversal

- **Source / approved decision:** Scope 73 · **B**
- **Approved requirement:** แต้มแยก Batch และ Expiry ใช้แต้มที่หมดอายุก่อน แจ้งเตือนใกล้หมดอายุ บันทึก Earn/Redeem/Expire/Reverse/Restore ใน Ledger ตรวจสอบได้ ปรับแต้มอัตโนมัติเมื่อ Full/Partial Refund รวมแต้มที่ได้รับไปแล้วถูกใช้ (ติดตามยอดค้างปรับ/ชดเชยตามนโยบาย) และคืนแต้มที่แลกเมื่อมีสิทธิ์โดยรักษากฎหมดอายุ
- **Verification intent (derived, not a new decision):** ไม่ Reversal ซ้ำ; ไม่ใช้/คืนแต้มข้ามร้าน; Ledger ไม่ลบเหตุการณ์

### VLP-074 — Loyalty Grace Period and Protected Points

- **Source / approved decision:** Scope 74 · **B**
- **Approved requirement:** ก่อนร้านหยุด Loyalty Program ต้องแจ้งล่วงหน้า หยุด Earn ตามวันกำหนดและให้ลูกค้า Redeem แต้มคงเหลือช่วง Grace Period ตามนโยบาย; หากร้าน Suspended พัก Earn/Redeem แต่ไม่ลบยอด; ก่อน Archived ต้องตรวจแต้มค้างและแจ้งลูกค้า; ไม่แปลงแต้มเป็นเงินสดหรือโอนข้ามร้านอัตโนมัติ
- **Verification intent (derived, not a new decision):** แต้มไม่หายจาก Pause; ปิดโปรแกรมตามเงื่อนไขแจ้งล่วงหน้าและ Audit

## Part V — Customer Experience, Availability and Order Reliability

### VLP-075 — No Customer Referral Program

- **Source / approved decision:** Scope 75 · **A**
- **Approved requirement:** ยังไม่มี Referral Codes, Referral Rewards หรือ Referral Analytics ใน Scope นี้ ลูกค้าแชร์ลิงก์ร้านหรือเมนูได้ตามปกติโดยไม่มีการติดตามหรือจ่ายรางวัลชวนเพื่อน
- **Verification intent (derived, not a new decision):** ไม่มี Referral Reward Issuance หรือ Self-Referral Logic เป็นข้อบังคับ

### VLP-076 — Granular Marketing Consent

- **Source / approved decision:** Scope 76 · **B**
- **Approved requirement:** แยก Service Notifications (Orders/Payments/Refunds/Security) จาก Marketing Notifications; ลูกค้า Opt-in แยกโปรโมชัน คูปอง ร้านแนะนำ และถอนหรือเปลี่ยน Consent ได้ตลอด พร้อม Consent History; Browser Push ต้องได้รับ Browser Permission ไม่มี LINE
- **Verification intent (derived, not a new decision):** ไม่ส่ง Marketing ถึงผู้ไม่ Opt-in; Order Status ในเว็บยังดูได้แม้ไม่เปิด Push

### VLP-077 — Rule-Based Personalized Recommendations

- **Source / approved decision:** Scope 77 · **B**
- **Approved requirement:** หน้า Marketplace แนะนำร้าน/เมนูโดยใช้ Favorites, Order History, หมวดหมู่สนใจ และบริบท Open/Availability/Queue ตามกฎที่อธิบายได้ ให้ลูกค้าปิด Personalization ได้ Guest เห็น General Recommendations และ Sponsored แยกชัดเจนจาก Organic/AI Chat
- **Verification intent (derived, not a new decision):** ปิด Personalization แล้วยังใช้บริการหลักได้; ไม่ปะปน Sponsored เป็น Organic

### VLP-078 — Real-Time Menu Availability and Optional Quantity Limits

- **Source / approved decision:** Scope 78 · **B**
- **Approved requirement:** ร้านเปิด/ปิดขายเมนูและตั้งโควตาจำนวนจานต่อเมนูแบบไม่บังคับ แจ้ง Sold-Out แบบ Real-Time ตรวจสอบราคาตัวเลือก/โควตาโดย Backend ก่อนเริ่มชำระ จองโควตาชั่วคราวแบบ Atomic เมื่อเข้าสู่ Payment หากผลจ่ายไม่แน่นอนห้ามปล่อยจน Reconcile; Paid Order จัดการ Amendment/Refund แทนการลบทิ้ง ไม่มี Ingredient Inventory
- **Verification intent (derived, not a new decision):** Concurrent Checkout ไม่ Oversell; Pending Unknown คง Reservation จนผลชัดเจน

### VLP-079 — Real-Time Modifier Availability and Optional Quantity Limits

- **Source / approved decision:** Scope 79 · **B**
- **Approved requirement:** ร้านเปิด/ปิด Option/Topping และตั้งโควตาแบบไม่บังคับ อัปเดต Real-Time ตรวจราคาและจองโควตาตัวเลือกกับเมนูหลักแบบ Atomic เมื่อเข้าสู่ Payment หากตัวเลือกหมดก่อนจ่ายต้องให้ลูกค้าเลือกใหม่และยืนยันราคา ไม่แทนให้อัตโนมัติ; Paid Order ใช้ Controlled Amendment/Refund
- **Verification intent (derived, not a new decision):** การจอง Option/Main Menu สำเร็จหรือไม่สำเร็จพร้อมกัน; ไม่เปลี่ยน Option ให้ลูกค้าเอง

### VLP-080 — Persistent Cart and Member Cross-Device Sync

- **Source / approved decision:** Scope 80 · **B**
- **Approved requirement:** Guest บันทึกตะกร้าแยกตามร้านบนอุปกรณ์เดิม สมาชิกซิงก์ตะกร้าแยกร้านข้ามอุปกรณ์หลังเข้าสู่ระบบ มี Cart Expiration, Version/Concurrency Control และ Backend Revalidation เมื่อ Checkout; การบันทึกไม่จองโควตาก่อนเริ่มชำระ; Dine-in Table Session ต้องไม่ถูกย้าย/รั่วไหลและการกู้ตะกร้าไม่สั่งหรือจ่ายเอง
- **Verification intent (derived, not a new decision):** แก้ Cart พร้อมกันไม่ทับกันเงียบ ๆ; Guest อุปกรณ์อื่นไม่เห็นตะกร้าอัตโนมัติ

### VLP-081 — End-to-End Idempotent Checkout

- **Source / approved decision:** Scope 81 · **B**
- **Approved requirement:** ใช้ Persistent Idempotency Key ผูก Checkout Intent, Request Fingerprint และ Merchant/Customer หรือ Guest Session; Safe Retry ต้องกลับ Order/Payment Attempt เดิม ไม่สร้าง Order/Payment/Queue/Quota/Coupon/Points ซ้ำ; Key เดิม Payload ใหม่ต้อง Reject; ใช้ Transactions/Unique Constraints/Atomic Operations และ Reconciliation สำหรับ Payment Unknown
- **Verification intent (derived, not a new decision):** Retry Request เดิมให้ผลธุรกิจเดิม; ไม่มี Order/Queue/Payment ซ้ำจาก Concurrent Requests

### VLP-082 — Guided Payment Recovery and Safe Retry UX

- **Source / approved decision:** Scope 82 · **B**
- **Approved requirement:** แสดง Real-Time Payment Status, Countdown และ Checking Payment; เมื่อผลจ่ายไม่ชัดเจนต้องตรวจ Provider/Reconciliation และห้ามสร้าง QR ใหม่จนยืนยัน Unpaid ปลอดภัย; New Payment Attempt ผูก Checkout/Order เดิมและตรวจสอบราคา/โควตาที่เกี่ยวข้องใหม่ มี Support เมื่อเงินถูกหักแต่ระบบไม่ยืนยัน; ผู้ใช้หรือ Slip ไม่ยืนยัน Paid แทน Provider
- **Verification intent (derived, not a new decision):** Pending/Unknown ป้องกัน Retry ที่เสี่ยง; Safe Retry ไม่สร้างออเดอร์หรือคิวซ้ำ

### VLP-083 — Controlled Payment Provider Degraded Mode

- **Source / approved decision:** Scope 83 · **B**
- **Approved requirement:** ตรวจสุขภาพ Payment Provider เมื่อใช้งานไม่ได้พัก Checkout/สร้าง Payment ใหม่ แสดงสถานะและให้เก็บตะกร้า ออเดอร์ Verified Paid ที่มีอยู่ทำต่อ รายการ Pending/Unknown เข้า Reconciliation โดยไม่คืน Reservation หรือให้จ่ายซ้ำอย่างไม่ปลอดภัย; เมื่อฟื้นให้ตรวจความพร้อมและเปิด Checkout อย่างควบคุมพร้อม Revalidation; ไม่มี Multi-Provider Failover บังคับ
- **Verification intent (derived, not a new decision):** Provider ล่มไม่ทำให้ Paid Order หยุด; ไม่เริ่มธุรกรรมใหม่ระหว่าง Degraded

### VLP-084 — Dynamic ETA and Owner Manual Pause Only

- **Source / approved decision:** Scope 84 · **A**
- **Approved requirement:** แสดงจำนวนคิวและ ETA ให้ลูกค้า/ร้าน ร้านกด Pause เองทั้งหมดหรือแยกช่องทางตามขอบเขตเดิม ไม่มี Threshold-Based Queue Overload Alerts เพิ่มเติมและไม่มี Auto-Pause จากจำนวนคิวหรือ ETA; Paid Orders ทำต่อ FIFO เดียว
- **Verification intent (derived, not a new decision):** ระบบไม่หยุดรับตามคิวล้นโดยอัตโนมัติ; Pause ตามการสั่งของ Owner เท่านั้น

### VLP-085 — Pickup Reminders and Structured No-Show

- **Source / approved decision:** Scope 85 · **B**
- **Approved requirement:** สำหรับ Pickup/Takeaway ให้แจ้ง Ready และ Reminder ตามช่วงเวลาที่นโยบายกำหนด ร้านบันทึก No-Show เหตุผล เวลา และ Audit Trail แยกจาก Completed/Handover มี Support/Dispute หากขัดแย้ง ไม่มี Refund อัตโนมัติ ไม่ให้แต้ม/สิทธิ์รีวิวเพียงเพราะ No-Show
- **Verification intent (derived, not a new decision):** No-Show ไม่เป็น Completed; ไม่ปลอมหลักฐานส่งมอบ; แจ้งเตือนตามสิทธิ์

### VLP-086 — Structured Preparation Delay Reporting and Notifications

- **Source / approved decision:** Scope 86 · **B**
- **Approved requirement:** ร้านแจ้งเหตุผลและเวลาล่าช้าโดยประมาณ ระบบอัปเดต Dynamic ETA แจ้งลูกค้าผ่านเว็บไซต์และ Browser Push ที่ได้รับอนุญาต เก็บ Delay History ลูกค้าสอบถามผ่าน In-App Chat ได้ ไม่เปลี่ยน Strict FIFO/Whole-Order Kitchen State และไม่ Auto-Refund
- **Verification intent (derived, not a new decision):** ETA/Delay Event แสดงให้ลูกค้าที่มีสิทธิ์; Delay ไม่ย้ายคิวหรือ Refund เอง

### VLP-087 — Controlled Kitchen Status Correction with Audit Trail

- **Source / approved decision:** Scope 87 · **B**
- **Approved requirement:** Owner แก้สถานะ Queued/Preparing/Ready ที่กดผิดได้เฉพาะ Allowed Transitions ก่อน Handover ระบุเหตุผลและบันทึก Actor/Timestamp/Before/After และแจ้งลูกค้าหากสถานะผิดถูกแจ้งไปแล้ว; หาก Handover Verified ต้อง Admin Review ไม่แก้ FIFO/Paid Timestamp/Order Snapshot หรือ Audit เดิม และไม่ข้าม Amendment/Refund
- **Verification intent (derived, not a new decision):** แก้ Ready→Preparing ได้เมื่อยังไม่ Handover; Corrective Event ไม่ลบ Event เดิม

### VLP-088 — Verified Completion with Payment and Fulfillment Records

- **Source / approved decision:** Scope 88 · **B**
- **Approved requirement:** แยก Payment, Kitchen และ Fulfillment Lifecycle; Completed ต่อเมื่อยืนยันส่งมอบจริงตามช่องทาง: Dine-in ส่งถึงโต๊ะ, Takeaway/Pickup QR/รหัสเฉพาะออเดอร์, Self-Delivery รหัสลูกค้า บันทึก Provider Payment Evidence, Handover Evidence และ Audit; Ready/No-Show ไม่เป็น Completed; Full/Partial Refund เป็นรายการอ้างอิงเพิ่มเติมไม่ลบหลักฐานเดิม และอาหารรับเงินตรงร้าน
- **Verification intent (derived, not a new decision):** Completed ต้องมี Handover Verification; Refund ไม่ rewrite Historical Payment

### VLP-089 — Detailed Customer Real-Time Order Event Timeline

- **Source / approved decision:** Scope 89 · **B**
- **Approved requirement:** ลูกค้าเห็นเหตุการณ์ Real-Time ของ Payment, Queue, Preparing, Delay, ETA Changes, Status Corrections, Ready, Handover และ Refund ตามลำดับเวลาจริงจาก Backend Immutable/Auditable History; เปิดเผยเฉพาะเจ้าของ Order (สมาชิก/Guest Secure Token) ไม่เปิดเผย Internal Audit, Fraud, PII/ข้อมูลลับของผู้อื่น และ Timeline ไม่เปลี่ยนสถานะธุรกรรมเอง
- **Verification intent (derived, not a new decision):** Event ลูกค้าเห็นเฉพาะ Allowed Fields; Correction เป็น Event ใหม่ ไม่ overwrite

### VLP-090 — Advanced Order History Filters and Smart Reorder

- **Source / approved decision:** Scope 90 · **B**
- **Approved requirement:** สมาชิกค้น/กรองประวัติด้วยชื่อร้าน ชื่อเมนู หมายเลขออเดอร์ วันที่ ช่องทาง และสถานะ; Reorder สร้าง Cart ใหม่จากข้อมูลเก่าที่ตรวจสอบราคา/Option/Topping/Availability/Quota ปัจจุบันโดย Backend แสดงรายการเปลี่ยน/หมดให้ผู้ใช้เลือกและยืนยัน ไม่ดึง Coupon/Points หรือ Table Session เดิมมาเอง ไม่เริ่ม Payment อัตโนมัติ; Guest เข้าถึงประวัติผ่าน Token/Claim
- **Verification intent (derived, not a new decision):** Reorder ไม่ใช้ราคาเก่าและไม่ชำระเอง; การค้นหาจำกัด Order ของผู้ใช้

### VLP-091 — Immutable Order Snapshot and Menu Revision Audit

- **Source / approved decision:** Scope 91 · **B**
- **Approved requirement:** เก็บ Order Snapshot ของชื่อรายการ Option ราคา ส่วนลด และยอดจริงขณะซื้อ; เก็บ Menu/Price/Option/Topping/Availability Revisions พร้อม Before/After, Actor, Timestamp; Restore เวอร์ชันเก่าโดยสร้าง Revision ใหม่ไม่แก้ธุรกรรมเก่าหรือ Audit เดิม; Pending Cart/Checkout ต้อง Revalidate Version/Price/Quota
- **Verification intent (derived, not a new decision):** แก้หรือ Restore เมนูไม่เปลี่ยนออเดอร์ Paid ในอดีต; Revision ติดตามย้อนหลังได้

### VLP-092 — CSV/Excel Menu Import and Bulk Editing

- **Source / approved decision:** Scope 92 · **B**
- **Approved requirement:** รองรับ Import Template ของเมนู หมวดหมู่ Option/Topping ผ่าน CSV/Excel พร้อม Validation, Preview, Duplicate Detection และแสดงรายการเพิ่ม/แก้ไข/ผิดพลาด; Bulk Actions สำหรับราคา หมวดหมู่ และสถานะขาย; Import Audit และ Menu Revisions ต้องตรวจ Tenant/Authorization และไม่เปลี่ยน Paid Order โดย Pending Cart ต้อง Revalidate
- **Verification intent (derived, not a new decision):** ไฟล์ผิดไม่เขียนข้อมูลอย่างไม่ปลอดภัย; Bulk Changes มี Revision/Audit และไม่ข้ามร้าน

## Unresolved parameters and provider-dependent details (TBD; not additional scope)

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

## Guidance for the Codex T0.1 unblock

1. Place this file at `specs/velopos-migration/approved-requirements.md` **inside the real repository**.
2. Verify that all `VLP-001` through `VLP-092` are present exactly once, with recorded decisions, approved requirements and no placeholder bodies.
3. Reconcile the generated `specs/velopos-migration/requirements.md` with this register; carry through all 92 requirement IDs, preserve the exact option selections and surface missing details as TBD. Compare against actual code to assign `IMPLEMENTED` / `PARTIAL` / `MISSING` / `CONFLICTING` / `OBSOLETE` only after evidence-based audit.
4. Update `design.md` and `tasks.md` traceability from this baseline; evaluate T0.1 against its documented acceptance criteria. The existence of this file alone does not imply that T0.1 passed or that implementation can begin automatically.
5. Do **not** modify application code, database data, permission settings, deployment or remote Git without separate review/authorization.

### Recommended follow-up command to Codex

```text
Read specs/velopos-migration/approved-requirements.md as the approved
VELOPOS scope baseline. Validate coverage VLP-001..VLP-092 and the
original Scope decisions. Reconcile requirements.md, design.md and
tasks.md, compare them to repository evidence, then reassess T0.1.
Treat listed TBD policy values as unresolved; do not guess.
Do not implement or modify application code yet.
Report discrepancies, traceability coverage and any remaining blockers.
```
