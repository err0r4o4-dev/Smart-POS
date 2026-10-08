# Complete route inventory

Canonical source: packages/contracts/routes.json. Exactly 16 modules and 106 planned page routes. Static routes are ranked before dynamic routes by React Router. Only ready pages are registered. A shell is not a completed business feature.

| Module | Route | Status | Phase | Access target |
| --- | --- | --- | --- | --- |
| Authentication | `/login` | Planned (not registered) | 1 | public entry / session for account |
| Authentication | `/register` | Planned (not registered) | 1 | public entry / session for account |
| Authentication | `/forgot-password` | Planned (not registered) | 1 | public entry / session for account |
| Authentication | `/reset-password` | Planned (not registered) | 1 | public entry / session for account |
| Authentication | `/setup` | Planned (not registered) | 1 | public entry / session for account |
| Authentication | `/account` | Planned (not registered) | 1 | public entry / session for account |
| Dashboard | `/dashboard` | Foundation shell (business dashboard planned) | 3 | session + tenant + branch permission |
| Dashboard | `/dashboard/branches` | Planned (not registered) | 3 | session + tenant + branch permission |
| Dashboard | `/tasks` | Planned (not registered) | 3 | session + tenant + branch permission |
| Dashboard | `/notifications` | Planned (not registered) | 3 | session + tenant + branch permission |
| POS | `/pos` | Planned (not registered) | 3 | session + tenant + branch permission |
| POS | `/pos/held-carts` | Planned (not registered) | 3 | session + tenant + branch permission |
| POS | `/pos/checkout` | Planned (not registered) | 3 | session + tenant + branch permission |
| POS | `/pos/returns` | Planned (not registered) | 3 | session + tenant + branch permission |
| POS | `/pos/exchanges` | Planned (not registered) | 3 | session + tenant + branch permission |
| POS | `/pos/register/open` | Planned (not registered) | 3 | session + tenant + branch permission |
| POS | `/pos/register/close` | Planned (not registered) | 3 | session + tenant + branch permission |
| POS | `/pos/register/history` | Planned (not registered) | 3 | session + tenant + branch permission |
| POS | `/pos/shifts` | Planned (not registered) | 3 | session + tenant + branch permission |
| Sales | `/sales` | Planned (not registered) | 3 | session + tenant + branch permission |
| Sales | `/sales/:id` | Planned (not registered) | 3 | session + tenant + branch permission |
| Sales | `/sales/refunds` | Planned (not registered) | 3 | session + tenant + branch permission |
| Sales | `/sales/voids` | Planned (not registered) | 3 | session + tenant + branch permission |
| Sales | `/receipts` | Planned (not registered) | 3 | session + tenant + branch permission |
| Sales | `/sales/tax-documents` | Planned (not registered) | 3 | session + tenant + branch permission |
| Products | `/products` | Planned (not registered) | 1 | session + tenant + branch permission |
| Products | `/products/new` | Planned (not registered) | 1 | session + tenant + branch permission |
| Products | `/products/:id` | Planned (not registered) | 1 | session + tenant + branch permission |
| Products | `/products/:id/edit` | Planned (not registered) | 1 | session + tenant + branch permission |
| Products | `/products/import` | Planned (not registered) | 1 | session + tenant + branch permission |
| Products | `/products/labels` | Planned (not registered) | 1 | session + tenant + branch permission |
| Products | `/categories` | Planned (not registered) | 1 | session + tenant + branch permission |
| Products | `/brands` | Planned (not registered) | 1 | session + tenant + branch permission |
| Products | `/units` | Planned (not registered) | 1 | session + tenant + branch permission |
| Inventory | `/inventory` | Planned (not registered) | 2 | session + tenant + branch permission |
| Inventory | `/inventory/balances` | Planned (not registered) | 2 | session + tenant + branch permission |
| Inventory | `/inventory/locations` | Planned (not registered) | 2 | session + tenant + branch permission |
| Inventory | `/inventory/movements` | Planned (not registered) | 2 | session + tenant + branch permission |
| Inventory | `/inventory/adjustments` | Planned (not registered) | 2 | session + tenant + branch permission |
| Inventory | `/inventory/counts` | Planned (not registered) | 2 | session + tenant + branch permission |
| Inventory | `/inventory/counts/:id` | Planned (not registered) | 2 | session + tenant + branch permission |
| Inventory | `/inventory/transfers` | Planned (not registered) | 2 | session + tenant + branch permission |
| Inventory | `/inventory/transfers/:id` | Planned (not registered) | 2 | session + tenant + branch permission |
| Inventory | `/inventory/reorder-points` | Planned (not registered) | 2 | session + tenant + branch permission |
| Inventory | `/inventory/valuation` | Planned (not registered) | 2 | session + tenant + branch permission |
| Shelves | `/shelves` | Planned (not registered) | 4 | session + tenant + branch permission |
| Shelves | `/shelves/new` | Planned (not registered) | 4 | session + tenant + branch permission |
| Shelves | `/shelves/:id` | Planned (not registered) | 4 | session + tenant + branch permission |
| Shelves | `/shelves/layout` | Planned (not registered) | 4 | session + tenant + branch permission |
| Shelves | `/shelves/replenishments` | Planned (not registered) | 4 | session + tenant + branch permission |
| Shelves | `/shelves/counts` | Planned (not registered) | 4 | session + tenant + branch permission |
| Shelves | `/shelves/discrepancies` | Planned (not registered) | 4 | session + tenant + branch permission |
| Purchasing | `/suppliers` | Planned (not registered) | 4 | session + tenant + branch permission |
| Purchasing | `/suppliers/:id` | Planned (not registered) | 4 | session + tenant + branch permission |
| Purchasing | `/purchasing/orders` | Planned (not registered) | 4 | session + tenant + branch permission |
| Purchasing | `/purchasing/orders/new` | Planned (not registered) | 4 | session + tenant + branch permission |
| Purchasing | `/purchasing/orders/:id` | Planned (not registered) | 4 | session + tenant + branch permission |
| Purchasing | `/purchasing/receipts` | Planned (not registered) | 4 | session + tenant + branch permission |
| Purchasing | `/purchasing/returns` | Planned (not registered) | 4 | session + tenant + branch permission |
| Purchasing | `/purchasing/suggestions` | Planned (not registered) | 4 | session + tenant + branch permission |
| Pricing & Promotions | `/pricing` | Planned (not registered) | 5 | session + tenant + branch permission |
| Pricing & Promotions | `/pricing/lists` | Planned (not registered) | 5 | session + tenant + branch permission |
| Pricing & Promotions | `/promotions` | Planned (not registered) | 5 | session + tenant + branch permission |
| Pricing & Promotions | `/promotions/:id` | Planned (not registered) | 5 | session + tenant + branch permission |
| Pricing & Promotions | `/discount-approvals` | Planned (not registered) | 5 | session + tenant + branch permission |
| Customers | `/customers` | Planned (not registered) | 5 | session + tenant + branch permission |
| Customers | `/customers/:id` | Planned (not registered) | 5 | session + tenant + branch permission |
| Customers | `/customers/groups` | Planned (not registered) | 5 | session + tenant + branch permission |
| Customers | `/loyalty` | Planned (not registered) | 5 | session + tenant + branch permission |
| Customers | `/loyalty/history` | Planned (not registered) | 5 | session + tenant + branch permission |
| Quality & Expiry | `/inventory/batches` | Planned (not registered) | 5 | session + tenant + branch permission |
| Quality & Expiry | `/inventory/expiry` | Planned (not registered) | 5 | session + tenant + branch permission |
| Quality & Expiry | `/inventory/write-offs` | Planned (not registered) | 5 | session + tenant + branch permission |
| Quality & Expiry | `/inventory/recalls` | Planned (not registered) | 5 | session + tenant + branch permission |
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
| Employees & Permissions | `/employees` | Planned (not registered) | 1 | session + tenant + branch permission |
| Employees & Permissions | `/employees/:id` | Planned (not registered) | 1 | session + tenant + branch permission |
| Employees & Permissions | `/roles` | Planned (not registered) | 1 | session + tenant + branch permission |
| Employees & Permissions | `/approvals` | Planned (not registered) | 1 | session + tenant + branch permission |
| Employees & Permissions | `/audit-logs` | Planned (not registered) | 1 | session + tenant + branch permission |
| Settings | `/settings` | Planned (not registered) | 1 | session + tenant + branch permission |
| Settings | `/settings/store` | Planned (not registered) | 1 | session + tenant + branch permission |
| Settings | `/settings/branches` | Planned (not registered) | 1 | session + tenant + branch permission |
| Settings | `/settings/payments` | Planned (not registered) | 1 | session + tenant + branch permission |
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

Additional Phase 0 routes outside the 106 business inventory: / redirects to /dashboard; /preview/pos and /preview/auth are explicitly non-functional presentations. Unmatched paths render 404. Navigation includes ready presentations only. Role-aware navigation and default-deny route guard are foundations, not authentication.
