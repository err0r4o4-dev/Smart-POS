# Flat Navigation Menu with Section Headers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the backoffice navigation from an accordion-based collapsible menu into a clean, flat list with subtle section headers tailored to restaurant operations.

**Architecture:** Update `routes.ts` to group management items into three focused operational sections (Operations, Management, Settings). Update `NavigationMenu.tsx` to render all navigation links directly under semantic section headers without accordion toggle states, eliminating click friction while preserving role/permission gating, localization, and active link indication. Update styling in `global.css` to align with the Warm Gold Apple-inspired design system.

**Tech Stack:** React 19, TypeScript, React Router 7, Lucide React, Vitest, Testing Library.

**Spec:** Approved Flat Navigation Menu with Section Headers design specification in conversation.

## Global Constraints

- Preserve all existing routes, business paths, permissions, and workspace routing invariants.
- Maintain Thai localization (`useLanguage`) with localized labels and fallbacks.
- Use only existing Lucide React icons and CSS variables from the Warm Gold design tokens (`--brand-soft-gradient`, `--primary-border`, `--text-secondary`, etc.).
- Do not introduce new external dependencies or breaking changes to API contracts.
- Strictly adhere to role and permission checks (`canAccess`).

## Review Focus

1. **Active route matching:** Ensure nested paths (e.g., `/manage/products/new`, `/manage/sales/:id`) still correctly highlight the parent navigation item.
2. **Permission filtering:** Items requiring specific permissions (e.g., `online_orders.read`, `refunds.read`, `storefront.manage`) must not appear for users lacking those permissions.
3. **Storefront settings link:** Navigating to `/manage/settings/storefront` works directly from the sidebar with correct active state.
4. **Mobile drawer navigation:** Clicking a nav link in the mobile drawer must trigger `onNavigate` to close the drawer.
5. **Screen reader accessibility:** Section headers and navigation links must have proper semantic hierarchy and `aria-current="page"` on the active link.

---

### Task 1: Update Routes and Navigation Groups in `routes.ts`

**Files:**
- Modify: `apps/web/src/app/routes.ts:35-135`
- Test: `apps/web/src/layouts/NavigationMenu.test.tsx`

**Interfaces:**
- Consumes: `paths`, `managementRoles`, `workspacePath`
- Produces: `navigation: NavigationItem[]`, `navigationGroups: NavigationGroup[]`

- [ ] **Step 1: Write a failing unit test in `NavigationMenu.test.tsx` for new group structure**

```typescript
it('assigns restaurant management routes to the 3 new functional sections', () => {
  const groupIds = navigationGroups.map((g) => g.id);
  expect(groupIds).toEqual(['operations', 'management', 'settings']);
  expect(navigationGroups.find((g) => g.id === 'operations')?.paths).toEqual([
    '/manage/pos',
    '/manage/online-orders',
    '/manage/restaurant/queue',
  ]);
  expect(navigationGroups.find((g) => g.id === 'management')?.paths).toEqual([
    '/manage/products',
    '/manage/sales',
    '/manage/receipts',
    '/manage/sales/refunds',
  ]);
  expect(navigationGroups.find((g) => g.id === 'settings')?.paths).toEqual([
    '/manage/settings',
    '/manage/settings/storefront',
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @smartpos/web -- NavigationMenu.test.tsx`
Expected: FAIL with mismatch in group IDs or paths.

- [ ] **Step 3: Update `managementItems` and `managementGroups` in `apps/web/src/app/routes.ts`**

Add `/settings/storefront` to `managementItems`:
```typescript
{
  to: paths.storefrontSettings,
  label: 'หน้าร้านออนไลน์',
  icon: 'dashboard',
  permission: 'storefront.manage',
},
```
Update `managementGroups`:
```typescript
const managementGroups: NavigationGroup[] = [
  {
    id: 'operations',
    label: 'การขายและหน้าร้าน',
    paths: ['/pos', '/online-orders', '/restaurant/queue'],
  },
  {
    id: 'management',
    label: 'จัดการร้าน',
    paths: [paths.products, '/sales', '/receipts', '/sales/refunds'],
  },
  {
    id: 'settings',
    label: 'ตั้งค่าระบบ',
    paths: [paths.settings, paths.storefrontSettings],
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @smartpos/web -- NavigationMenu.test.tsx`
Expected: PASS for the group structure test.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/routes.ts apps/web/src/layouts/NavigationMenu.test.tsx
git commit -m "feat(web): update navigation route groups for restaurant operations"
```

---

### Task 2: Redesign `NavigationMenu.tsx` to Flat Sectioned Layout

**Files:**
- Modify: `apps/web/src/layouts/NavigationMenu.tsx`
- Test: `apps/web/src/layouts/NavigationMenu.test.tsx`

**Interfaces:**
- Consumes: `items: NavigationItem[]`, `access: Session`, `groups?: NavigationGroup[]`, `homePath?: string`, `onNavigate?: () => void`
- Produces: Clean flat navigation menu component with section headers and direct links

- [ ] **Step 1: Write failing unit tests in `NavigationMenu.test.tsx` for flat rendering**

```typescript
it('renders all grouped links directly under section headers without accordion buttons', () => {
  renderMenu('/manage/dashboard');
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByText('การขายและหน้าร้าน')).toBeVisible();
  expect(screen.getByText('จัดการร้าน')).toBeVisible();
  expect(screen.getByText('ตั้งค่าระบบ')).toBeVisible();
  expect(screen.getByRole('link', { name: 'ภาพรวม' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'รับออเดอร์หน้าร้าน' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'เมนูอาหาร' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'การตั้งค่า' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'หน้าร้านออนไลน์' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'คู่มือ' })).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @smartpos/web -- NavigationMenu.test.tsx`
Expected: FAIL because buttons currently exist for accordion toggles.

- [ ] **Step 3: Refactor `NavigationMenu.tsx`**

- Remove `useSyncExternalStore`, `readRawNavState`, `writeStoredNavState`, `STORAGE_PREFIX`, and accordion state handling.
- Update `pathIcons` with icons for all operational routes:
  - `/manage/dashboard`: `House`
  - `/manage/pos`: `Play`
  - `/manage/online-orders`: `ShoppingCart`
  - `/manage/restaurant/queue`: `CookingPot`
  - `/manage/products`: `Utensils`
  - `/manage/sales`: `BarChart3`
  - `/manage/receipts`: `Receipt`
  - `/manage/sales/refunds`: `RotateCcw`
  - `/manage/settings`: `Settings`
  - `/manage/settings/storefront`: `Globe`
  - `/help` or `/manage/help`: `BookOpen`
- Update `groupIcons`:
  - `operations`: `ShoppingCart`
  - `management`: `Utensils`
  - `settings`: `Settings`
- Render sections with `<div className="nav-section" key={group.id}>`, `<div className="nav-section-title">`, and `<div className="nav-section-items">`.
- Render `NavLink` directly for each item with `aria-current="page"` when active, passing `onClick={onNavigate}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @smartpos/web -- NavigationMenu.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/layouts/NavigationMenu.tsx apps/web/src/layouts/NavigationMenu.test.tsx
git commit -m "feat(web): render flat navigation menu with section headers"
```

---

### Task 3: Add Section Header Styles in `global.css`

**Files:**
- Modify: `apps/web/src/styles/global.css`

- [ ] **Step 1: Inspect and add `.nav-section` and `.nav-section-title` rules**

In `apps/web/src/styles/global.css`:
```css
.nav-section {
  margin: 12px 0 4px;
}
.nav-section:first-of-type {
  margin-top: 8px;
}
.nav-section-title {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  text-transform: uppercase;
  user-select: none;
}
.nav-section-title > svg {
  color: var(--primary-strong);
  opacity: 0.8;
  flex-shrink: 0;
}
.nav-section-items {
  display: flex;
  flex-direction: column;
}
```
Clean up or deprecate obsolete `.nav-group-toggle` styles while keeping `.nav-item` styling intact.

- [ ] **Step 2: Verify visually that spacing, hierarchy, and active states render cleanly**

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/styles/global.css
git commit -m "style(web): add styling for flat navigation section headers"
```

---

### Task 4: Complete Unit Tests in `NavigationMenu.test.tsx`

**Files:**
- Modify: `apps/web/src/layouts/NavigationMenu.test.tsx`

- [ ] **Step 1: Replace obsolete accordion toggle tests with comprehensive flat navigation tests**

Write tests covering:
- Every grouped route belongs to exactly one group.
- All links render without accordion buttons.
- Active item highlighting on root and nested routes (e.g. `/manage/products/item-1`).
- Direct link highlighting for `/manage/sales`, `/manage/receipts`, `/manage/sales/refunds`.
- Permission gating denies links when user lacks required permission.
- Non-management role (e.g. `INVENTORY_STAFF`) cannot see owner navigation.
- Clicking nav link fires `onNavigate`.

- [ ] **Step 2: Run all NavigationMenu tests**

Run: `npm run test --workspace @smartpos/web -- NavigationMenu.test.tsx`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/layouts/NavigationMenu.test.tsx
git commit -m "test(web): update NavigationMenu tests for flat sectioned structure"
```

---

### Task 5: Full Verification and Cleanup

**Files:**
- None created; verify entire project builds and tests pass.

- [ ] **Step 1: Run WorkspacePages tests**

Run: `npm run test --workspace @smartpos/web -- WorkspacePages.test.tsx`
Expected: PASS.

- [ ] **Step 2: Run TypeScript typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run web build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Check git status and diff**

Run: `git diff --check`
Expected: No errors.
