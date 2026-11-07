# Online Storefront Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated "หน้าร้านออนไลน์" (Online Storefront Settings) page at route `/settings/storefront` that matches the provided VELOPOS UI design with a responsive two-column layout, and connect navigation to/from the main `/settings` page.

**Architecture:** Create `StorefrontSettingsPage` in `apps/web/src/features/organization/` with dedicated styles in `storefront-settings.css`. Register the route `/settings/storefront` under the authorized organization workspace replacing the previous redirect in `router.tsx`. Add an intuitive navigation button and entry card in `SettingsPage.tsx` so users can seamlessly navigate between general store settings and online storefront settings.

**Tech Stack:** React 19, TypeScript, React Router 6/7 (`useWorkspaceNavigate`, `Link`), Lucide React icons, Vitest, Testing Library.

**Spec:** User-provided screenshot and conversation spec for "หน้าร้านออนไลน์" settings.

## Global Constraints

- Use branch `feature/fix-frist-job`.
- Preserve existing uncommitted work and existing database migrations/schema.
- Maintain Thai-first localization with authentic copy matching the provided design.
- Follow the design system: warm neutrals, soft borders (`#edf2f7`), yellow/gold accents (`#facc15` / `#eab308`), accessible contrast, focus states, and semantic ARIA attributes.
- Responsive layout: two columns on desktop (>= 1024px) gracefully collapsing to a single column on mobile (< 1024px).
- Copy-to-clipboard must provide clear user feedback (toast or status message).
- QR code card must support downloading the QR code as an image.

## Review Focus

1. **Route Guard & Authorization:** Access to `/settings/storefront` must require active session and organization context with appropriate role/permission checks (`storefront.manage` or `organization.read`).
2. **Form State Integrity:** Toggle switch enables/disables storefront without losing entered values (store name, slug, description, selected channels, theme color).
3. **URL Slug Validation & Live Sync:** Typing in the store slug input immediately reflects in the live store link (`https://{slug}.velopos.com`) and QR code display.
4. **Channel Selection:** Allows independent toggling of Takeaway (🛍️), Delivery (🛵), and Dine-in (🍽️).
5. **Mobile Viewport Usability:** Form inputs, color swatches, QR display, and header actions must not cause horizontal scroll or touch target overlap on small screens (320px–375px).

---

### Task 1: Route Setup and Navigation from Settings Page

**Files:**
- Modify: `apps/web/src/app/routes.ts`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/app/route-pages.tsx`
- Modify: `apps/web/src/features/organization/OrganizationPages.tsx`
- Modify: `apps/web/src/features/organization/SettingsPage.tsx`
- Test: `apps/web/src/features/organization/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: `paths.settings` from `apps/web/src/app/routes.ts`
- Produces: `paths.storefrontSettings = '/settings/storefront'` and export `StorefrontSettingsPage`

- [ ] **Step 1: Write the failing test for SettingsPage navigation link**

In `apps/web/src/features/organization/SettingsPage.test.tsx`, add test asserting that a button or link with text or aria-label for "ตั้งค่าหน้าร้านออนไลน์" is rendered and points to `/settings/storefront`.

- [ ] **Step 2: Run test to verify it fails**

Verify test fails because the navigation link/button to `/settings/storefront` does not exist yet.

- [ ] **Step 3: Update routes and router**

1. In `apps/web/src/app/routes.ts`, add `storefrontSettings: '/settings/storefront'` to `paths`.
2. In `apps/web/src/app/route-pages.tsx`, export lazy `StorefrontSettingsPage`.
3. In `apps/web/src/app/router.tsx`, replace the `<Navigate to={paths.settings} replace />` on path `/settings/storefront` with `<StorefrontSettingsPage />`.
4. In `apps/web/src/features/organization/SettingsPage.tsx`, update the header action button to navigate to `/settings/storefront` with label "ตั้งค่าหน้าร้านออนไลน์", and add an accessible card/link to storefront settings.

- [ ] **Step 4: Run test to verify it passes**

Run test to confirm the navigation button in SettingsPage passes.

- [ ] **Step 5: Review git diff**

Verify no extraneous edits or regressions in existing routes.

---

### Task 2: Implement StorefrontSettingsPage Component

**Files:**
- Create: `apps/web/src/features/organization/StorefrontSettingsPage.tsx`
- Modify: `apps/web/src/features/organization/OrganizationPages.tsx` (re-export `StorefrontSettingsPage`)
- Create: `apps/web/src/features/organization/StorefrontSettingsPage.test.tsx`

**Interfaces:**
- Produces: `StorefrontSettingsPage: React.FC`
- Props: `{ initialSettings?: Partial<StorefrontConfig> }`

- [ ] **Step 1: Write comprehensive failing tests in `StorefrontSettingsPage.test.tsx`**

Test scenarios:
1. Renders page header with title "หน้าร้านออนไลน์" and subtitle "ตั้งค่าหน้าร้านสำหรับรับออเดอร์ออนไลน์ (ซื้อกลับบ้าน / เดลิเวอรี)".
2. Renders toggle card "เปิดใช้งานหน้าร้านออนไลน์" with accessible role="switch" / toggle state.
3. Renders store details fields:
   - "ชื่อหน้าร้าน (แสดงบนเว็บ) *" input initialized with organization name.
   - "ลิงก์หน้าร้าน (URL) *" input with `.velopos.com` suffix.
   - "คำอธิบายร้าน (ไม่บังคับ)" textarea with character counter (e.g. `43 / 200`).
4. Renders order channel checkboxes:
   - 🛍️ ซื้อกลับบ้าน (Takeaway)
   - 🛵 เดลิเวอรี (Delivery)
   - 🍽️ ทานที่ร้าน (Dine-in)
5. Renders storefront display card:
   - 6 theme color swatches (Yellow, Red, Green, Blue, Purple, Gradient) with selected state.
   - Logo/cover thumbnail and "อัปโหลดภาพ" button.
6. Renders online order hours radio buttons:
   - "ตามเวลาเปิด-ปิดร้าน" (ใช้เวลาจาก "เวลาทำการ" ของร้าน)
   - "กำหนดแยกสำหรับออนไลน์" (ตั้งเวลาเฉพาะการรับออเดอร์ออนไลน์)
7. Renders link & QR card:
   - Storefront full URL display with copy button and copy feedback.
   - QR code preview with "ดาวน์โหลด" button.
8. Save button triggers save action and shows feedback toast.

- [ ] **Step 2: Run test to verify it fails**

Verify test fails as `StorefrontSettingsPage` is not yet created.

- [ ] **Step 3: Implement `StorefrontSettingsPage.tsx`**

Create `StorefrontSettingsPage.tsx` with:
- State hooks for `isEnabled`, `storeName`, `slug`, `description`, `channels` (takeaway, delivery, dineIn), `themeColor`, `logoUrl`, `hoursMode`, `copyStatus`, `saveStatus`.
- Computed `fullUrl = `https://${slug}.velopos.com``.
- Crisp inline SVG QR code representing `fullUrl` with download helper.
- Clipboard copy handler using `navigator.clipboard.writeText` with fallback.
- Header with back navigation button linking to `/settings` and "บันทึกการตั้งค่า" button.

- [ ] **Step 4: Run test to verify it passes**

Verify all tests in `StorefrontSettingsPage.test.tsx` pass.

---

### Task 3: Implement Dedicated Styles in `storefront-settings.css`

**Files:**
- Create: `apps/web/src/features/organization/storefront-settings.css`
- Modify: `apps/web/src/features/organization/StorefrontSettingsPage.tsx` (import `./storefront-settings.css`)

**Interfaces:**
- Produces: CSS classes matching the exact design tokens and responsive grid.

- [ ] **Step 1: Write CSS rules for all UI elements**

Include:
- `.storefront-settings-page`: max-width 1280px, responsive padding.
- `.storefront-grid`: 2 columns (left: 1.2fr, right: 0.9fr), gap 20px, collapsing to 1 column at <= 1024px.
- Toggle switch component: iOS/Material style rounded switch with `#facc15` active background, smooth transition.
- URL input group: input field seamlessly joined with `.velopos.com` fixed badge.
- Character counter: right-aligned muted text below textarea (`43 / 200`).
- Channel pill/checkbox cards: custom check indicators with emoji icons (🛍️, 🛵, 🍽️).
- Color swatches palette: 32px circular buttons, active ring indicator (`ring-2 ring-offset-2 ring-amber-500`), smooth hover.
- Cover photo preview box with camera/upload button.
- Radio options group: custom styled radio cards with subtext.
- QR card container: centered QR image, white card border, copy icon button, download button with icon.

- [ ] **Step 2: Verify responsive behavior and visual styling**

Check layout at desktop (> 1024px), tablet (768px), and mobile (375px). Ensure no overflow or clipping.

---

### Task 4: Integration Verification and Cross-Component Checks

**Files:**
- Verify: `apps/web/src/features/organization/SettingsPage.test.tsx`
- Verify: `apps/web/src/features/organization/StorefrontSettingsPage.test.tsx`
- Verify: Type check and lint checks

- [ ] **Step 1: Run full test suite for organization features**

Execute `npm run test -- apps/web/src/features/organization/` to verify all organization and settings tests pass.

- [ ] **Step 2: Run typecheck and lint**

Execute `npm run typecheck` to confirm zero TypeScript compilation errors.

- [ ] **Step 3: Review git diff**

Verify `git diff` contains only intended files with clean formatting and no regressions.
