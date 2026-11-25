# B16 Menu Import Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for native execution. Do not delegate, stage, commit, or push without separate authorization. Steps use checkbox syntax for tracking.

**Goal:** Give the future Owner menu preview a tested, format-neutral validator for the approved B16 v1 template, without adding a storage or HTTP path.

**Architecture:** Reuse the catalog reader for bounded CSV/XLSX decoding through a thin adapter; keep native menu row rules in `restaurant`. Return typed valid rows or line-and-field diagnostics, never both. Resolve references against the restaurant's saved menu and classify add/change/unchanged in a later slice, where the revision and ownership boundaries can be enforced.

**Tech Stack:** Go 1.26+, standard library, existing `catalog` file reader and `pricing.Decimal`.

**Spec:** [D03 B16 template and apply policy](../../../specs/velopos-migration/design.md#b16-proposal-version-1-template-and-apply-policy), [VLP-092](../../../specs/velopos-migration/requirements.md#vlp-092---csvexcel-menu-import-and-bulk-editing), [T3.9](../../../specs/velopos-migration/tasks.md#t3-9).

## Global Constraints

- One rectangular UTF-8 CSV (optional BOM) or single-sheet XLSX; 5 MiB input, 2,000 data rows, 20 MiB aggregate expanded XLSX; reject formulas in XLSX.
- All nine v1 columns must appear once; order can differ. After the retained reader's header trimming, match names case-sensitively. `template_version` is `1` on every row.
- Preserve Thai text and exact nonnegative decimal prices with at most two fractional digits. Blank means omitted; explicit zero remains present. No implicit deletion, rounding, or conversion from scientific notation.
- This slice has no API route, database access, migration, dependency install, or menu writes. Preserve catalog importer behavior and the separate ratings worktree changes, including migration 51.

## Review Focus

- A reordered workbook and BOM CSV with the same Thai labels and prices produce identical rows.
- Missing, duplicate or unknown columns cannot silently bind values to another field.
- A late malformed row with a valid first row yields diagnostics but no usable rows.
- Blank price and zero price remain distinct; `1e2` and `1.001` fail rather than normalize.
- Child-before-parent input is legal; a duplicate `(row_kind, ref)` is not, even if its parent is different. Reusing the spelling across kinds is legal.

---

### Task 1: Validate the B16 v1 template without changing existing import behavior

**Files:** Modify [catalog/import_parser.go](../../../apps/api/internal/modules/catalog/import_parser.go) for the adapter only. Create `apps/api/internal/modules/restaurant/menu_import_template.go` and `apps/api/internal/modules/restaurant/menu_import_template_test.go`.

**Interfaces:** `catalog.ParseImportTable(filename string, data []byte) (headers []string, rows [][]string, err error)` delegates to `parseFile`. Package-private `parseMenuImportTemplate(filename string, data []byte) ([]menuImportRow, []menuImportIssue, error)` returns `ErrInput` for unreadable files or invalid headers, ordered issues for row errors, and rows only on complete success. `menuImportIssue` carries `Line int`, `Field string`, `Code string`. `menuImportRow` carries `Line int`, `Kind`, `Ref`, `ParentRef`, `Name`, `SaleStatus` strings, `PriceMinor *int64`, `MinChoices`, `MaxChoices *int32`. Line numbers are logical template rows: the header is row 1.

- [ ] **Write failing tests** in `menu_import_template_test.go`: `TestMenuImportTemplateFormatParity` compares rows from reordered BOM CSV and a synthetic XLSX, including `ข้าวกะเพรา`, price `85.00` → `8500`, blank → `nil` and `0.00` → non-nil `0`; include child before parent and the same `ref` spelling in different kinds.
- [ ] **Write rejection tests:** `TestMenuImportTemplateRejectsInvalidFile` expects `ErrInput` and no rows for missing, duplicate or unknown headers, nonrectangular CSV, input over 5 MiB, 2,001 data rows and an XLSX formula. Keep the existing catalog archive-limit regression tests in scope. `TestMenuImportTemplateRowDiagnostics` expects no rows and the offending logical line/field for mixed versions, unknown row kind, missing `ref`, a duplicate same-kind `ref` under two parents, a field not applicable to its kind, `price` values `1e2` and `1.001`, invalid `sale_status` and invalid choice integers or an inverted pair.
- [ ] **Verify RED** from `apps/api`: `go test ./internal/modules/restaurant -run '^TestMenuImportTemplate' -count=1`; expect missing v1 parser symbols, not an environment failure.
- [ ] **Implement the thin adapter** over the current file reader. Keep existing catalog callers and errors unchanged.
- [ ] **Implement v1 row validation.** Bind fields by header name. Require version, kind and `ref`; preserve nonblank refs as opaque case-sensitive values and reject surrounding whitespace. Allow `name` for all four kinds; `parent_ref` for ITEM/GROUP/OPTION; `price` and `sale_status` (`ACTIVE`/`INACTIVE`) for ITEM/OPTION; choice bounds for GROUP only. Parse prices through `pricing.Decimal(text, 2)` and choice bounds as nonnegative `int32` decimal integers. Compare min/max when both are supplied. Detect duplicates independently of file order. Do not require other cells on an existing entity patch or infer a new entity from a missing match. Diagnostics identify fields without echoing raw cell contents.
- [ ] **Verify GREEN** from `apps/api` with `GOPROXY=off` and database fixture environment flags unset: rerun the focused test, then `go test ./internal/modules/catalog ./internal/modules/restaurant -count=1` and `go vet ./internal/modules/catalog ./internal/modules/restaurant`. Check formatting of changed Go files and `git diff --check`. Do not provision PostgreSQL for this pure validation slice.
- [ ] **Record the checkpoint** in T3.9 and remove only this task's temporary TODO section after verification. Keep full B16 acceptance open.

## Subsequent slices, not authorized by this plan alone

1. Specify durable `ref` binding and how an Owner first binds preexisting entities; never infer identity from a label or unmatched update. Agree on preview retention and modifier/availability write contracts. Preserve draft and paid-order boundaries.
2. Design and review scoped persistence, stale-revision rejection, atomic apply/replay, audit and a data-preserving migration path. Use a confirmed isolated disposable database for cross-tenant and transaction acceptance.
3. Add the Owner API and UI with matching OpenAPI and browser evidence. Verify immutable paid snapshots and pending-cart revalidation before calling VLP-092 complete.
