# Restaurant Setup UI Redesign (/setup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/setup` as a standalone, distraction-free onboarding experience matching the user's VELOPOS reference mockup (Image 2), completely detached from the backoffice sidebar and breadcrumb navigation.

**Architecture:** Move `/setup` outside `RoleWorkspaceLayout` in `router.tsx` so it does not render `WorkspaceShell` (removing the left sidebar menu and top breadcrumbs header). Rebuild `SetupPage` layout with a 2-column centered card stage: a left warm-cream hero panel (featuring title, subtitle, POS graphic illustration, and 3 value-proposition highlights) and a right white form panel (exact fields, placeholders, info callout, and "ย้อนกลับ" / "ถัดไป →" action buttons).

**Tech Stack:** React 18, React Router 6, TanStack Query, Lucide icons, Vanilla CSS variables (Warm Gold tokens).

**Spec:** User reference screenshot (Image 2) showing:

1. No application sidebar or navigation menu.
2. Centered split container on warm ambient background.
3. Left hero panel:
   - "ตั้งค่าร้านอาหารของคุณ" / "เริ่มใช้งาน VELOPOS"
   - Subtitle: "ระบบ POS ร้านอาหารครบวงจร จัดการเมนู ออเดอร์ โต๊ะ และการขาย ในที่เดียว"
   - 3D POS illustration
   - 3 Feature badges:
     - "ตั้งค่าร้านง่าย" ("พร้อมใช้งานภายในไม่กี่นาที")
     - "รองรับการสั่งซื้อหลายรูปแบบ" ("สั่งล่วงหน้า, สั่งที่โต๊ะ (QR), และหน้าร้านออนไลน์")
     - "ดูรายงานและยอดขาย" ("ช่วยให้คุณบริหารร้านได้อย่างมีประสิทธิภาพ")
4. Right form panel:
   - Icon squircle + "ข้อมูลร้าน" + "กรอกข้อมูลพื้นฐานของร้านอาหาร เพื่อเริ่มใช้งานระบบ"
   - Fields: ชื่อร้าน *, ประเภทร้าน *, อีเมลร้าน, โทรศัพท์ร้าน, ที่อยู่ร้าน, คำอธิบายร้าน
   - Info callout: "คุณสามารถแก้ไขข้อมูลเหล่านี้ได้ในภายหลัง เช่น ชื่อร้าน ที่อยู่ รูปภาพ และคำอธิบายร้าน"
   - Action buttons: "← ย้อนกลับ" (secondary) and "ถัดไป →" (primary warm gold pill).

## Global Constraints

- Preserve all functional logic, step progression (steps 0 to 6), server mutations, CSRF tokens, and idempotency keys.
- Preserve all existing unit tests in `OrganizationPages.test.tsx` (button has `aria-label="บันทึกและถัดไป"` so `getByRole('button', { name: /บันทึกและถัดไป/ })` continues to pass while displaying "ถัดไป →").
- Support responsive breakpoints: desktop (2 columns), tablet / mobile (stacked single column).

## Review Focus

1. **Sidebar absence:** Ensure navigating to `/setup` contains zero elements from `WorkspaceShell` (no `aside.sidebar`, no breadcrumbs).
2. **Form submission & accessibility:** Verify required fields trigger validation; button retains accessible name for test suite and screen readers.
3. **Step progression:** Verify advancing to subsequent steps maintains consistent layout without breaking.
4. **Hydration & persistence:** Verify loading existing organization or resuming a saved setup works seamlessly.
5. **Responsive behavior:** Check 320px, 768px, and 1280px widths to ensure no horizontal scroll or layout overflows.

---

### Task 1: Decouple `/setup` Route from `RoleWorkspaceLayout`

**Files:**

- Modify: `apps/web/src/app/router.tsx:106-120`
- Test: `apps/web/src/app/router.tsx`

- [ ] **Step 1: Inspect `router.tsx` route tree**
      Move `{ path: paths.setup, element: <SetupPage /> }` outside `RoleWorkspaceLayout` so it is a direct child of `OrganizationWorkspaceProvider`.

- [ ] **Step 2: Update `router.tsx`**
      Place `/setup` under `OrganizationWorkspaceProvider` as a sibling to `RoleWorkspaceLayout`:

```tsx
  {
    element: <OrganizationWorkspaceProvider />,
    children: [
      { path: paths.setup, element: <SetupPage /> },
      {
        element: <RoleWorkspaceLayout />,
        children: [
          { path: paths.system, element: <DashboardPage /> },
          { path: paths.help, element: <HelpPage /> },
...
```

- [ ] **Step 3: Verify with unit tests**
      Run `npx vitest run WorkspacePages` to verify routing tests pass.

---

### Task 2: Implement 2-Column Hero & Form Structure in `OrganizationPages.tsx`

**Files:**

- Modify: `apps/web/src/features/organization/OrganizationPages.tsx`

- [ ] **Step 1: Add SetupHeroPanel Component**
      Implement the left hero visual panel with:
- Title: "ตั้งค่าร้านอาหารของคุณ" & "เริ่มใช้งาน VELOPOS"
- Description: "ระบบ POS ร้านอาหารครบวงจร จัดการเมนู ออเดอร์ โต๊ะ และการขาย ในที่เดียว"
- Image illustration: `/images/auth-pos-reference.png`
- 3 Value proposition highlights with Store, LayoutGrid, and TrendingUp icons.

- [ ] **Step 2: Refine Step 0 Fields & Notice Callout in `OrganizationPages.tsx`**
      Update Step 0 field layout, placeholders, and callout text:
- Placeholder for store name: "เช่น ร้านอาหารของคุณ"
- Business type options: "ร้านอาหาร (Restaurant)"
- Placeholder for email: "เช่น contact@velocafe.com"
- Placeholder for phone: "เช่น 061-507-1665"
- Placeholder for address: "เช่น 123 ถ.สุขุมวิท แขวงคลองตัน เขตวัฒนา กรุงเทพฯ 10110"
- Placeholder for description: "เช่น ร้านอาหารและคาเฟ่ อาหารไทย เครื่องดื่ม และเบเกอรี่"
- Notice text: "คุณสามารถแก้ไขข้อมูลเหล่านี้ได้ในภายหลัง เช่น ชื่อร้าน ที่อยู่ รูปภาพ และคำอธิบายร้าน"

- [ ] **Step 3: Update Action Buttons**
      Render:
- Secondary button: `← ย้อนกลับ`
- Primary button: `ถัดไป →` (with `aria-label="บันทึกและถัดไป"` so both visual "ถัดไป" and test regex `บันทึกและถัดไป` are satisfied).

---

### Task 3: Style `/setup` with Pixel-Perfect Warm Gold Tokens (`setup.css`)

**Files:**

- Modify: `apps/web/src/features/organization/setup.css`

- [ ] **Step 1: Define standalone stage & layout**
      Create `.setup-standalone-shell`:
- Ambient background with subtle warm radial glow.
- Centered container `.setup-stage-container` (max-width 1200px, border-radius 24px, subtle box-shadow).
- Two-column grid `.setup-split-grid` (`minmax(380px, 440px) 1fr`, gap 24px).

- [ ] **Step 2: Style Left Hero Panel**
- Background: `#fcf9f2` / subtle warm cream border.
- Clean typography and 3 benefit cards with rounded yellow squircles.
- Art image with subtle mask and shadow.

- [ ] **Step 3: Style Right Form Panel & Controls**
- White card (`#ffffff`) with clean padding.
- Modern input controls with subtle border and focus rings.
- Warm gold primary button `.setup-btn-next` with amber hover and rounded pill corners.

- [ ] **Step 4: Add Mobile & Tablet Responsive Media Queries**
- Under 960px: stack vertically, hero panel folds gracefully above form.
- Under 640px: full-width inputs and action buttons stacked.

---

### Task 4: Verification and Quality Checks

**Files:**

- Test: `apps/web/src/features/organization/OrganizationPages.test.tsx`

- [ ] **Step 1: Run focused unit tests**
      Run: `npx vitest run OrganizationPages`
      Expected: ALL PASS.

- [ ] **Step 2: Run typecheck**
      Run: `npm run typecheck`
      Expected: 0 errors.

- [ ] **Step 3: Run lint**
      Run: `npm run lint`
      Expected: 0 errors.

- [ ] **Step 4: Update TODO.md and close active task**
