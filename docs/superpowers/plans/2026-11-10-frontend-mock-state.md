# Frontend Mock State for UI Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide comprehensive in-browser mock state for previewing and testing all frontend UI pages in SmartPOS without requiring a running Go backend or PostgreSQL database.

**Architecture:** Create a client-side mock interception layer in `apps/web/src/mocks/` with data fixtures covering all pages and endpoints. Intercept requests at the browser `fetch` level when mock mode is enabled via URL search parameter (`?mock=true`), `localStorage` (`smartpos_mock=true`), or environment configuration. Provide an interactive, non-intrusive floating control toggle in development mode to toggle Mock Mode on/off at will.

**Tech Stack:** React 19, TypeScript, React Router 7, TanStack Query 5, Vitest, Testing Library.

## Page Coverage Scope
1. **Auth & Identity:** `/login`, `/register`, `/forgot-password`, `/account` (instant demo login with OWNER role)
2. **Dashboard & Workspaces:** `/manage/dashboard`, `/help/system` (full store KPIs, overview cards, ready status)
3. **POS Terminal & Selling:** `/pos`, `/pos/checkout`, `/pos/held-carts` (terminals, active shift, dish catalog, held carts, cart operations)
4. **Cashier Shifts:** `/pos/register/open`, `/pos/register/close`, `/pos/register/history`, `/pos/shifts`
5. **Kitchen Display System (KDS):** `/restaurant/queue` (live queues #001 to #004 with DINE_IN, TAKEAWAY, DELIVERY, and status filters)
6. **Online Orders Management:** `/online-orders`, `/online-orders/:orderId` (order list, detailed cards, status transitions)
7. **Restaurant Management:** `/restaurant/tables`, `/settings`, `/setup` (zones, tables T01-T05, VIP1, 7-step onboarding, store hours)
8. **Sales Reports & Receipts:** `/sales`, `/sales/:id`, `/receipts` (sales history, filtering, detailed receipt views)
9. **Refunds & Returns:** `/sales/refunds`, `/sales/refunds/:code` (confirmed cash refunds and pending settlement approvals)
10. **Menu & Taxonomy:** `/products`, `/products/:id`, `/categories`, `/units` (food dishes, drinks, desserts, categories, counting units)
11. **Customer Storefront:** `/shop`, `/shop/:slug`, `/shop/:slug/cart`, `/shop/:slug/track/:orderId` (customer online catalog, cart, tracking)

---

### Task 1: Create Mock Data Fixtures and Mock Router Engine

**Files:**
- Create: `apps/web/src/mocks/mock-data.ts` (rich Thai restaurant fixtures: dishes, categories, units, tables, orders, queue, sales, refunds, shift, organization)
- Create: `apps/web/src/mocks/mock-engine.ts` (request matching, URL parsing, response envelope generation, stateful in-memory mutations)
- Test: `apps/web/src/mocks/mock-engine.test.ts`

- [ ] **Step 1: Write unit tests for mock engine and endpoints**
- [ ] **Step 2: Implement `mock-data.ts` with comprehensive fixtures**
- [ ] **Step 3: Implement `mock-engine.ts` with route dispatching and stateful handlers**
- [ ] **Step 4: Run Vitest on `mock-engine.test.ts` and verify all tests pass**

---

### Task 2: Implement Mock Mode Activator and Fetch Interceptor

**Files:**
- Create: `apps/web/src/mocks/mock-service.ts` (activation check, interceptor installation, toggle helper)
- Create: `apps/web/src/components/feedback/MockModeBadge.tsx` (convenient floating badge to toggle Mock Mode ON/OFF)
- Modify: `apps/web/src/app/providers.tsx` (install mock interceptor at app initialization if enabled, render badge in dev)
- Test: `apps/web/src/mocks/mock-service.test.ts`

- [ ] **Step 1: Write unit tests for mock mode activator**
- [ ] **Step 2: Implement `mock-service.ts` with clean `window.fetch` patch**
- [ ] **Step 3: Create `MockModeBadge.tsx` for easy toggle in the UI**
- [ ] **Step 4: Connect into `providers.tsx`**
- [ ] **Step 5: Verify tests and typecheck**

---

### Task 3: Comprehensive End-to-End UI Verification with Mock State

**Files:**
- Verify in browser / Vitest that all primary pages load with populated data when `smartpos_mock=true`
- Run `npm run typecheck`, `npm run lint`, and `npm run test --workspace @smartpos/web`

- [ ] **Step 1: Run full typecheck and lint**
- [ ] **Step 2: Run focused web test suite**
- [ ] **Step 3: Verify clean git status and document how to preview UI with mock state**