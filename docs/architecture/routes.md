# Complete route inventory

Canonical source: packages/contracts/routes.json. Exactly 17 modules and 114 page routes (implemented and planned). Static routes are ranked before dynamic routes by React Router. Only ready pages are registered. A shell is not a completed business feature.

Implemented identity routes are Phase 1A; organization/branch/member routes below are Phase 1B. These statuses supersede older planned labels without adding routes. Tenant routes require an authenticated session, active organization membership and the listed permission; Owner/Manager branch scope is enforced again by the API. `/setup` also supports memory-only email invitation acceptance after sign-in. See [organization architecture](organization.md).

The nine Products routes are implemented Phase 1C. Catalog records are organization-scoped and shared across branches, not branch-owned. The backend rechecks active organization membership and catalog permissions; the existing Manager policy denies catalog access when no assigned active branch remains. Operational staff access follows active organization membership and fixed catalog permissions, not a separate all-role active-branch gate. Mutation-specific permissions are enforced separately from read access. See [catalog architecture](catalog.md).

Phase5.1 registers two Returns routes;5.2 two Exchange/Void;5.3 five Pricing;5.4 three Customer;5.5 two Loyalty;5.6 four Quality routes. Phase0–4 and Phase5.1–5.7 COMPLETED (Local); Phase5 overall COMPLETED (Local); Phase6–7 NOT STARTED; Phase6 NOT READY; Production Ready NO. The historical Phase5 checkpoint counted16 modules/106 routes; storefront and its management-only Stripe sandbox diagnostic bring the current inventory to17 modules/114 routes. Sandbox diagnostics do not implement customer online payment or fulfillment. See [Quality](quality.md), [sandbox](payment-sandbox.md) and [final acceptance](../development/phase57-verification.md).

Storefront adds seven logical routes; management/work routes below use their existing workspace prefixes. See [storefront flow](storefront.md). This extension does not claim online payment or Phase6 readiness.

| Module | Route | Status | Phase | Access target |
| --- | --- | --- | --- | --- |
| Storefront | `/shop` | Implemented; published-store directory | 5 | public |
| Storefront | `/shop/:slug` | Implemented; selectively published catalog | 5 | public |
| Storefront | `/shop/:slug/cart` | Implemented; guest pickup order | 5 | public + Origin + rate limit |
| Storefront | `/shop/:slug/track/:orderId` | Implemented; private tracking fragment | 5 | matching access token |
| Storefront | `/settings/storefront` | Implemented under `/manage` | 5 | Owner/Manager + storefront.manage |
| Storefront | `/online-orders` | Implemented under `/manage` and `/work` | 5 | session + tenant + branch + online_orders.read |
| Storefront | `/online-orders/:orderId` | Implemented; staff workflow / POS entry | 5 | online_orders.read; mutations separately gated |
| Authentication | `/login` | Implemented Phase 1A | 1 | public Origin-validated entry |
| Authentication | `/register` | Implemented Phase 1A | 1 | public Origin-validated entry |
| Authentication | `/forgot-password` | Implemented Phase 1A | 1 | public Origin-validated entry |
| Authentication | `/reset-password` | Implemented Phase 1A | 1 | public token + Origin-validated entry |
| Authentication | `/setup` | Implemented Phase 1B | 1 | session; no existing tenant required for creation |
| Authentication | `/account` | Implemented Phase 1A | 1 | session |
| Dashboard | `/dashboard` | Foundation shell (business dashboard planned) | 3 | session + tenant + branch permission |
| Dashboard | `/dashboard/branches` | Planned (not registered) | 3 | session + tenant + branch permission |
| Dashboard | `/tasks` | Planned (not registered) | 3 | session + tenant + branch permission |
| Dashboard | `/notifications` | Planned (not registered) | 3 | session + tenant + branch permission |
| POS | `/pos` | Implemented (Phase 3) | 3 | session + tenant + branch permission |
| POS | `/pos/held-carts` | Implemented (Phase 3) | 3 | session + tenant + branch permission |
| POS | `/pos/checkout` | Implemented (Phase 3) | 3 | session + tenant + branch permission |
| POS | `/pos/returns` | Implemented Phase 5.1 (Local) | 5 | session + tenant + branch + returns.read; actions reauthorize |
| POS | `/pos/exchanges` | Implemented Phase 5.2 (Local) | 5 | session + tenant + branch + exchange.read; actions reauthorize |
| POS | `/pos/register/open` | Implemented (Phase 3) | 3 | session + tenant + branch permission |
| POS | `/pos/register/close` | Implemented (Phase 3) | 3 | session + tenant + branch permission |
| POS | `/pos/register/history` | Implemented (Phase 3) | 3 | session + tenant + branch permission |
| POS | `/pos/shifts` | Implemented (Phase 3) | 3 | session + tenant + branch permission |
| Sales | `/sales` | Implemented (Phase 3) | 3 | session + tenant + branch permission |
| Sales | `/sales/:id` | Implemented (Phase 3) | 3 | session + tenant + branch permission |
| Sales | `/sales/refunds` | Implemented Phase 5.1 (Local) | 5 | session + tenant + branch + refunds.read; settlement restricted |
| Sales | `/sales/voids` | Implemented Phase 5.2 (Local) | 5 | session + tenant + branch + sales.void.read; approval/completion restricted |
| Sales | `/receipts` | Implemented (Phase 3) | 3 | session + tenant + branch permission |
| Sales | `/sales/tax-documents` | Planned (not registered) | 3 | session + tenant + branch permission |
| Products | `/products` | Implemented Phase 1C | 1 | session + tenant + catalog.read |
| Products | `/products/new` | Implemented Phase 1C | 1 | session + tenant + catalog.create |
| Products | `/products/:id` | Implemented Phase 1C | 1 | session + tenant + catalog.read |
| Products | `/products/:id/edit` | Implemented Phase 1C | 1 | session + tenant + catalog.update; archive separately gated |
| Products | `/products/import` | Implemented Phase 1C | 1 | session + tenant + catalog.import |
| Products | `/products/labels` | Implemented Phase 1C | 1 | session + tenant + catalog.labels.print |
| Products | `/categories` | Implemented Phase 1C | 1 | catalog.read; changes require catalog.category.manage |
| Products | `/brands` | Implemented Phase 1C | 1 | catalog.read; changes require catalog.brand.manage |
| Products | `/units` | Implemented Phase 1C | 1 | catalog.read; changes require catalog.unit.manage |
| Inventory | `/inventory` | Implemented Phase 2 | 2 | session + tenant + branch permission |
| Inventory | `/inventory/balances` | Implemented Phase 2 | 2 | session + tenant + branch permission |
| Inventory | `/inventory/locations` | Implemented Phase 2 | 2 | session + tenant + branch permission |
| Inventory | `/inventory/movements` | Implemented Phase 2 | 2 | session + tenant + branch permission |
| Inventory | `/inventory/adjustments` | Implemented Phase 2 | 2 | session + tenant + branch permission |
| Inventory | `/inventory/counts` | Implemented Phase 2 | 2 | session + tenant + branch permission |
| Inventory | `/inventory/counts/:id` | Implemented Phase 2 | 2 | session + tenant + branch permission |
| Inventory | `/inventory/transfers` | Implemented Phase 2 | 2 | session + tenant + branch permission |
| Inventory | `/inventory/transfers/:id` | Implemented Phase 2 | 2 | session + tenant + branch permission |
| Inventory | `/inventory/reorder-points` | Implemented Phase 2 | 2 | session + tenant + branch permission |
| Inventory | `/inventory/valuation` | Planned (not registered) | 2 | session + tenant + branch permission |
| Shelves | `/shelves` | Implemented Phase 4 (Local) | 4 | session + tenant + branch permission |
| Shelves | `/shelves/new` | Implemented Phase 4 (Local) | 4 | session + tenant + branch permission |
| Shelves | `/shelves/:id` | Implemented Phase 4 (Local) | 4 | session + tenant + branch permission |
| Shelves | `/shelves/layout` | Implemented Phase 4 (Local) | 4 | session + tenant + branch permission |
| Shelves | `/shelves/replenishments` | Implemented Phase 4 (Local) | 4 | session + tenant + branch permission |
| Shelves | `/shelves/counts` | Implemented Phase 4 (Local) | 4 | session + tenant + branch permission |
| Shelves | `/shelves/discrepancies` | Implemented Phase 4 (Local) | 4 | session + tenant + branch permission |
| Purchasing | `/suppliers` | Implemented Phase 4 (Local) | 4 | session + tenant + branch permission |
| Purchasing | `/suppliers/:id` | Implemented Phase 4 (Local) | 4 | session + tenant + branch permission |
| Purchasing | `/purchasing/orders` | Implemented Phase 4 (Local) | 4 | session + tenant + branch permission |
| Purchasing | `/purchasing/orders/new` | Implemented Phase 4 (Local) | 4 | session + tenant + branch permission |
| Purchasing | `/purchasing/orders/:id` | Implemented Phase 4 (Local) | 4 | session + tenant + branch permission |
| Purchasing | `/purchasing/receipts` | Implemented Phase 4 (Local) | 4 | session + tenant + branch permission |
| Purchasing | `/purchasing/returns` | Implemented Phase 4 (Local) | 4 | session + tenant + branch permission |
| Purchasing | `/purchasing/suggestions` | Implemented Phase 4 (Local) | 4 | session + tenant + branch permission |
| Pricing & Promotions | `/pricing` | Implemented Phase 5.3 (Local) | 5 | session + tenant + pricing.read; API branch scope and mutations reauthorize |
| Pricing & Promotions | `/pricing/lists` | Implemented Phase 5.3 (Local) | 5 | session + tenant + pricing.read; API branch scope and mutations reauthorize |
| Pricing & Promotions | `/promotions` | Implemented Phase 5.3 (Local) | 5 | session + tenant + promotions.read; API branch scope and mutations reauthorize |
| Pricing & Promotions | `/promotions/:id` | Implemented Phase 5.3 (Local) | 5 | session + tenant + promotions.read; API branch scope and mutations reauthorize |
| Pricing & Promotions | `/discount-approvals` | Implemented Phase 5.3 (Local) | 5 | session + tenant + discount.read; API branch scope and mutations reauthorize |
| Customers | `/customers` | Implemented Phase 5.4 | 5 | session + tenant + customers.read; active branch authorization; mutations reauthorize |
| Customers | `/customers/:id` | Implemented Phase 5.4 | 5 | session + tenant + customers.read; history additionally requires customers.history.read |
| Customers | `/customers/groups` | Implemented Phase 5.4 | 5 | session + tenant + customers.groups.read; mutations require customers.groups.manage |
| Customers | `/loyalty` | Implemented Phase 5.5 (Local) | 5 | session + tenant + loyalty.read; mutations reauthorize |
| Customers | `/loyalty/history` | Implemented Phase 5.5 (Local) | 5 | session + tenant + branch + loyalty.read |
| Quality & Expiry | `/inventory/batches` | Implemented Phase 5.6 (Local) | 5 | session + tenant + branch + quality.read; mutations separately authorized |
| Quality & Expiry | `/inventory/expiry` | Implemented Phase 5.6 (Local) | 5 | session + tenant + branch + quality.read; mutations separately authorized |
| Quality & Expiry | `/inventory/write-offs` | Implemented Phase 5.6 (Local) | 5 | session + tenant + branch + quality.read; mutations separately authorized |
| Quality & Expiry | `/inventory/recalls` | Implemented Phase 5.6 (Local) | 5 | session + tenant + branch + quality.read; mutations separately authorized |
| AI Intelligence | `/ai/overview` | Planned (not registered) | 6 | session + tenant + branch permission |
| AI Intelligence | `/ai/forecast` | Planned (not registered) | 6 | session + tenant + branch permission |
| AI Intelligence | `/ai/reorder` | Planned (not registered) | 6 | session + tenant + branch permission |
| AI Intelligence | `/ai/shelf` | Planned (not registered) | 6 | session + tenant + branch permission |
| AI Intelligence | `/ai/anomalies` | Planned (not registered) | 6 | session + tenant + branch permission |
| AI Intelligence | `/ai/explanations` | Planned (not registered) | 6 | session + tenant + branch permission |
| Reports | `/reports` | Planned (not registered) | 6 | session + tenant + branch permission |
| Reports | `/reports/sales` | Planned (not registered) | 6 | session + tenant + branch permission |
| Reports | `/reports/profit` | Planned (not registered) | 6 | session + tenant + branch permission |
| Reports | `/reports/inventory` | Planned (not registered) | 6 | session + tenant + branch permission |
| Reports | `/reports/shelves` | Planned (not registered) | 6 | session + tenant + branch permission |
| Reports | `/reports/employees` | Planned (not registered) | 6 | session + tenant + branch permission |
| Reports | `/reports/export` | Planned (not registered) | 6 | session + tenant + branch permission |
| Employees & Permissions | `/employees` | Implemented Phase 1B | 1 | session + tenant + employee.read; scoped write permissions |
| Employees & Permissions | `/employees/:id` | Implemented Phase 1B | 1 | session + tenant + employee.read; scoped update/remove/audit |
| Employees & Permissions | `/roles` | Implemented Phase 1B | 1 | session + tenant + role.read |
| Employees & Permissions | `/approvals` | Planned (not registered) | 1 | session + tenant + branch permission |
| Employees & Permissions | `/audit-logs` | Planned (not registered) | 1 | session + tenant + branch permission |
| Settings | `/settings` | Planned (not registered) | 1 | session + tenant + branch permission |
| Settings | `/settings/store` | Implemented Phase 1B | 1 | session + tenant + organization.read; Owner writes |
| Settings | `/settings/branches` | Implemented Phase 1B | 1 | session + tenant + branch.read; scoped branch writes |
| Settings | `/settings/payments` | Planned (not registered) | 1 | session + tenant + branch permission |
| Storefront | `/settings/storefront/payments` | Implemented sandbox diagnostic only | 5 | management + session + tenant + storefront.manage; canonical `/manage/settings/storefront/payments`; no customer payment or stock effects |
| Settings | `/settings/tax` | Planned (not registered) | 1 | session + tenant + branch permission |
| Settings | `/settings/receipts` | Planned (not registered) | 1 | session + tenant + branch permission |
| Settings | `/settings/hardware` | Planned (not registered) | 1 | session + tenant + branch permission |
| Settings | `/settings/notifications` | Planned (not registered) | 1 | session + tenant + branch permission |
| Settings | `/settings/integrations` | Planned (not registered) | 1 | session + tenant + branch permission |
| Settings | `/settings/backup` | Planned (not registered) | 1 | session + tenant + branch permission |
| Help & System | `/help` | Implemented presentation | 0 | public system |
| Help & System | `/support` | Planned (not registered) | 0 | public system |
| Help & System | `/403` | Implemented presentation | 0 | public system |
| Help & System | `/404` | Implemented presentation | 0 | public system |

Additional Phase 0 routes outside the 106 business inventory: / redirects to /dashboard; /preview/pos and /preview/auth are explicitly non-functional presentations. Unmatched paths render 404. Navigation includes implemented tenant modules and ready presentations only. Tenant business routes additionally require real sessions and backend membership/branch authorization.

## Inventory access and deferred valuation

Ten Phase 2 Inventory routes above are implemented; /inventory/valuation stays Planned because no accounting costing method exists. Read pages require inventory.read, movement history additionally requires inventory.audit.read at the API, and each mutation checks its own inventory permission. Lists/details/actions are branch-scoped; destination transfer participants can inspect that transfer without reading arbitrary source balances. Owner has organization-wide scope; Manager remains assigned-active-branch scoped. There is no fake inventory data or business dashboard/checkout implementation.
