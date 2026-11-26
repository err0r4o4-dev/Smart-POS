# Product Catalog (Phase 1C)

Phase 1C.1-1C.4 are completed against local acceptance gates on 2026-10-09. This is not a production release or hardware certification. See the dated [verification record](../development/verification.md) and [security model](../security/security-model.md).

## Domain and ownership

- Organization is the tenant. Products, taxonomy, variants, barcodes and import jobs are organization-owned. Branch switching does not clone catalog records or introduce branch-specific SKUs/prices.
- Product is descriptive data: name, description, category, brand and status. A product is created atomically with at least one saleable Variant; a simple product has a Default variant.
- Variant is the stable future stock/sales identity: immutable SKU, name, string attributes, unit, cost/selling prices, currency, status and barcodes. No stock quantity is stored here.
- SKU is trimmed/uppercased, organization-unique and permanently reserved even after archiving. Allowed syntax is `[A-Z0-9][A-Z0-9_.-]{0,79}`. It cannot be renamed through variant updates or reused by import.
- Cost is nonnegative; selling price is strictly positive. PostgreSQL stores NUMERIC(18,2); Go validates exact rational values and sends decimal strings to TypeScript. Organization currency is authoritative. No float arithmetic is used for prices.
- Product, Variant and taxonomy have ACTIVE/INACTIVE/ARCHIVED states. Archive/restore is a status change, not hard deletion. Activating a Product requires an active Variant. Archived products reject Variant mutations; restore the Product first. Stable IDs and reserved SKUs remain intact.
- Revisions protect edits against stale clients. Existing organization row locks serialize tenant operations, including catalog changes and import confirmation; throughput/load certification is deferred.

## Taxonomy and units

Categories support a same-tenant parent hierarchy; self-parenting and cycles are rejected by the service. Brands have unique normalized names per organization. Referenced categories/brands/units must belong to the same tenant and be active when assigned. Taxonomy lists use bounded pagination.

Units have a unique uppercase code/name, a type (COUNT, WEIGHT, VOLUME or PACKAGING), and an optional base unit. A root unit has factor 1; a derived unit uses positive exact NUMERIC(18,6). Conversion is one level; non-packaging units must match the base type, while PACKAGING can reference an active root of another type. Cycles/chains and invalid base changes are rejected. This is metadata only: no quantity conversion, stock movement, costing or inventory ledger is implemented.

## Barcode strategy

- Barcode codes are strings; leading zeros are retained. EAN13, EAN8 and UPCA require exact length/digits/checksum. CODE128 uses printable ASCII accepted by the encoder.
- A Variant can have manufacturer, alias and internal mappings, with at most one primary mapping. Codes are unique across the organization, regardless of source/status. Conflicts with a different SKU or symbology are rejected.
- Internal generation uses cryptographic randomness: `SP-` followed by 32 uppercase hexadecimal characters, encoded as CODE128. It is a private internal identifier, not an EAN/UPC or GS1 allocation.
- Barcode lookup is tenant-scoped and requires read permission. The keyboard-wedge scanner interface submits the exact code; automated keyboard/browser checks do not certify physical scanners.
- Only barcode mappings have a DELETE endpoint. Removal does not delete the Variant; another mapping can become primary. Product/taxonomy/Variant records have no hard-delete operation.
- Browser labels render actual SVG bars with SKU/code/product text and quantity/layout controls. Print CSS removes application chrome. Tests verify SVG output, print invocation and print-media rendering, not a native print dialog, thermal commands or physical printer output.

## Authorization and caching

All routes use existing authentication, Origin/CSRF write checks and the Phase 1B authorization service. The backend checks active organization/member status on each operation. Owner has all catalog permissions; Manager has them only while at least one assigned active branch remains. Other operational roles use active organization membership and the matrix below; there is no separate all-role active-branch prerequisite for organization-wide catalog access.

| Capability                              | OWNER | MANAGER | INVENTORY_STAFF | CASHIER / PURCHASING_STAFF |
| --------------------------------------- | ----- | ------- | --------------- | -------------------------- |
| Read                                    | Yes   | Yes     | Yes             | Yes                        |
| Create / update                         | Yes   | Yes     | Yes             | No                         |
| Archive / restore                       | Yes   | Yes     | No              | No                         |
| Import / manage barcodes / print labels | Yes   | Yes     | Yes             | No                         |
| Manage category / brand / unit          | Yes   | Yes     | No              | No                         |

The ten permissions are `catalog.read`, `catalog.create`, `catalog.update`, `catalog.archive`, `catalog.import`, `catalog.barcode.manage`, `catalog.labels.print`, `catalog.category.manage`, `catalog.brand.manage` and `catalog.unit.manage`. "Authorized inventory staff" means these explicit fixed grants, not unrestricted administration. The frontend hides/guards actions but is not the security boundary.

Catalog query keys contain user ID, organization ID and resource/query path. They intentionally omit branch ID because the catalog is shared. Existing tenant switch/logout clears/cancels tenant queries; catalog mutations are also aborted when user/organization changes. No cross-tenant placeholder cache is reused. Selection preferences never authorize API access.

## Database

Additive `database/migrations/000004_catalog.up.sql` creates `categories`, `brands`, `units`, `products`, `product_variants`, `product_barcodes` and `product_import_jobs`. It does not rewrite legacy records, drop tables or guess existing product data. Readiness now requires clean migration version 4.

All seven tables enable and FORCE RLS with transaction-local organization context. Composite organization/object FKs prevent cross-tenant category/brand/unit/product/variant links. Unique constraints reserve SKU, unit codes and barcode codes; normalized taxonomy-name indexes and a partial primary-barcode unique index enforce identity rules. Product status/name/list, category/brand, variant parent, barcode parent and import tenant/time indexes support scoped queries.

`smartpos_runtime` receives SELECT/INSERT/UPDATE and DELETE only on barcode mappings. Successful changes and import lifecycle events use existing organization audit records in the same transaction. This is not a denied-request audit or protection from compromised privileged bootstrap credentials.

## API contract

The base path is `/api/v1/organizations/{id}`. [OpenAPI](../../packages/contracts/openapi.yaml) and `apps/web/src/lib/catalog-api.ts` define request/response shapes; shared error envelopes retain request IDs and generic safe messages. Invalid input returns 400, permission denial 403, missing/out-of-tenant objects 404, and duplicate/stale/expired conflicts 409. Create endpoints return 201; other successful operations return 200.

| API suffix                                                        | Operations                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------- |
| `/products`                                                       | GET paginated list; POST Product plus Variants atomically |
| `/products/{productId}`                                           | GET detail; PATCH descriptive/status fields with revision |
| `/products/{productId}/variants`                                  | GET list; POST Variant                                    |
| `/products/{productId}/variants/{variantId}`                      | PATCH Variant with revision; immutable SKU                |
| `/products/{productId}/variants/{variantId}/barcodes`             | POST barcode mapping                                      |
| `/products/{productId}/variants/{variantId}/barcodes/generate`    | POST internal CODE128 mapping                             |
| `/products/{productId}/variants/{variantId}/barcodes/{barcodeId}` | DELETE mapping                                            |
| `/barcodes/lookup?code=...`                                       | GET exact-code lookup                                     |
| `/products/{productId}/labels`                                    | GET label data with separate print permission             |
| `/categories`, `/brands`, `/units`                                | GET paginated list; POST taxonomy; PATCH `/{resourceId}`  |
| `/products/import/preview`                                        | POST multipart `file` and optional JSON `mapping`         |
| `/products/import/{jobId}`                                        | GET creator-private preview/result                        |
| `/products/import/{jobId}/confirm`                                | POST JSON `{"mode":"CREATE"}` / SKIP / UPDATE             |

List filters include `search`, `status`, `category_id`, `brand_id`, `page`, `page_size` and `sort`. Product search covers name/SKU/barcode; sort accepts `name`, `-name`, `updated`, `-updated`. Page size defaults to 20 and is capped at 100. Taxonomy uses the applicable search/status/page controls.

## CSV/XLSX import

Each row represents a new single-Variant Product or an existing SKU to update/skip. Create required units and optional category/brand records first; imports resolve active references by name (unit can also use code) and do not auto-create taxonomy. Columns can be remapped in the UI or with a JSON field-to-header mapping.

```csv
product_name,sku,barcode,symbology,category,brand,unit,cost_price,selling_price
Example Tea,TEA-001,0012345678905,EAN13,,,PCS,12.50,25.00
```

Required mapped values are product_name, sku, unit, cost_price and selling_price. Optional columns are barcode, symbology, category and brand. An omitted barcode symbology defaults to CODE128. Category/brand names must resolve uniquely to active same-tenant records. Use text cells for SKUs/barcodes in XLSX: digits already lost by spreadsheet numeric formatting cannot be recovered. CSV is UTF-8 with optional BOM. Export/download tooling is not implemented, so no spreadsheet formula-export safety is claimed.

Limits are 5 MiB uploaded file, 2,000 data rows, 40 columns, 2,000 characters per parsed cell, and mapping up to 16 KiB. XLSX accepts a single `sheet1.xml` worksheet, at most 100 ZIP entries and 20 MiB expanded data. Malformed ZIP/XML, path traversal, formulas and incompatible workbooks reject; formulas are never executed and external resources are not fetched. Preview creation is capped at 30 per user/organization/hour and expires after one hour.

Preview stores validated rows, row errors, existing SKU identity and Product/Variant revisions; it does not create catalog records. Only its creator in the same tenant can fetch/confirm the job, with current import permission. Confirmation revalidates references, barcode conflicts and revisions under the transaction lock. Any invalid row, stale preview or write failure rolls back the whole catalog import; there is no partial-success mode.

- CREATE requires every SKU to be new; existing SKUs cause conflict.
- SKIP imports new SKUs and leaves existing SKU rows unchanged, but still rejects invalid rows/stale previews.
- UPDATE imports new SKUs and updates existing Variant prices/unit while preserving SKU, Variant name, attributes and status. It updates the parent Product name and provided category/brand; blank optional references preserve existing values. A supplied valid new barcode is added, not used to delete old mappings. Archived SKUs remain reserved and are rejected.
- Repeating confirmation for a COMPLETED job with the same mode returns the saved result without importing again. A different mode conflicts. Result totals report imported/updated/skipped/failed; a committed atomic import has zero failed rows.

Job expiry is checked by the service. No background cleanup/retention policy or durable import worker is implemented; expired stored previews need a separately authorized retention design before production.

## UI and Phase 2 boundary

The nine implemented routes are `/products`, `/products/new`, `/products/:id`, `/products/:id/edit`, `/products/import`, `/products/labels`, `/categories`, `/brands` and `/units`. They reuse the management shell, organization gate, Golden Amber Glass tokens and TanStack Query. Forms/tables expose loading, empty, error and permission states; bounded lists and internally scrollable mobile tables preserve the existing 106-route inventory.

Product/Variant/unit IDs and exact prices are available for a future explicitly authorized Phase 2. Inventory must define stock ledger/balances, warehouse locations, quantity/rounding policies, adjustments, counts and transfers separately. There is no inventory movement, branch stock/price override, sales/checkout, image upload/storage, scanner/printer certification or thermal-printer integration in Phase 1C. Phase 2 is NOT STARTED.
