# Task: Recreate Login Design Matching User Screenshot Reference

## Objective
- Match the exact visual layout from user screenshot:
  1. Left Column (`auth-split-visual`): Warm beige/cream background, Brand logo at top, Thai slogan "จัดการร้านให้ง่ายขึ้น" with subtle yellow hand-drawn underline accent, sub-headline, and 3D retail POS counter illustration (Monitor + thermal receipt printer + receipt paper + potted plant + shop canopy in background).
  2. Right Column (`auth-split-form`): Clean white panel with top toolbar (Back link "<- กลับหน้าหลัก", Language switcher pill), centered modern rounded Card containing:
     - Heading: "ยินดีต้อนรับกลับ"
     - Subheading: "เข้าสู่ระบบสำหรับเจ้าของร้าน ผู้จัดการ และพนักงานเพื่อจัดการร้านค้าและยอดขายของคุณ"
     - Soft tinted input fields (`#f0f4f9` background, no borders/soft border, no hard icons in the input box) with labels "ที่อยู่อีเมล", "รหัสผ่าน" and internal "แสดง" toggle button
     - Warm golden primary button: "เข้าสู่ระบบ" with subtle rounded corners and shadow
     - Bottom row: "ลืมรหัสผ่าน?" on left, "สร้างบัญชี" on right.

## Scope & Affected Components
- `apps/web/src/layouts/AuthLayout.tsx`
- `apps/web/src/features/auth/AuthPages.tsx`
- `apps/web/src/styles/global.css`

## Implementation Checklist
- [ ] Phase 1: Form & Component Updates
  - [ ] Update `apps/web/src/layouts/AuthLayout.tsx` to support the two-column split screen with the POS illustration on the left
  - [ ] Update `apps/web/src/features/auth/AuthPages.tsx` login form elements and labels to match the clean rounded design
- [ ] Phase 2: CSS Styling
  - [ ] Update `apps/web/src/styles/global.css` with exact colors, typography, soft input backgrounds, pill buttons, and responsive breakpoints
- [ ] Phase 3: Verification
  - [ ] Run `npm run typecheck`
  - [ ] Run `vitest run AuthPages`
  - [ ] Run `npm run build`
  - [ ] Cleanup TODO.md
