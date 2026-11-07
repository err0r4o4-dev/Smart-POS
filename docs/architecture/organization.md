# Phase 1B organization, branches and authorization

## Owner-only transition (2026-11-05)

The approved policy restricts backoffice access to active OWNER memberships;
MANAGER, CASHIER, INVENTORY_STAFF and PURCHASING_STAFF are denied backoffice
access. Invitation, member and role administration UI and API are being retired.
Existing accounts, memberships, role values and historical records are retained;
no schema migration is planned. Implementation and acceptance remain in progress.
Phase 1B verification below is historical evidence and does not establish
acceptance of the new policy. See `TODO.md` for current checks.

Historical Phase 1B local implementation gate: **COMPLETED (2026-10-09)**. Evidence is in [verification](../development/verification.md).

## Repository and domain decisions

- Retain React/TypeScript/Vite/TanStack Query, Golden Amber tokens/local fonts, the Go modular monolith, PostgreSQL, internal FastAPI and Caddy. No new dependencies or placeholder domains were introduced.
- Organization is the single tenant abstraction; do not create a parallel Store tenant. A global user may have one unique membership per organization with different role/status/branch assignments. Removing a membership does not delete the user's account or memberships elsewhere.
- Existing organization/branch tables from migration 1 are extended, not recreated. A branch belongs to exactly one organization. Codes are normalized to uppercase by API validation; organization code is globally unique, branch code is unique within its organization.
- Fixed roles belong to the organization membership, not global identity. No custom role editor or browser-trusted role/organization header exists. Branch membership FKs include organization ID; assigned non-Owner branches must be active and same-tenant.
- Go's organization module owns policy, validation, transactions, persistence and transport in a small set of real-use-case files. Branches/employees are not empty independently scaffolded modules. Identity still owns sessions/Origin/CSRF; transport composes both modules.

## Onboarding and database changes

`000003_organization.up.sql` is additive/forward-only. It extends organization details/defaults and branch contacts/main-branch flag; adds organization_memberships, branch_memberships, organization_invitations, organization_audit_events and organization_creation_requests; adds composite FKs/indexes/owner constraints and the runtime role. Readiness requires a clean migration version 3.

Organization creation uses one transaction for organization + active Owner + active main branch + THB/default Asia/Bangkok/th-TH configuration + audit + idempotency record. Per-user UUID `Idempotency-Key`, a normalized payload SHA-256 fingerprint and transaction advisory lock prevent duplicate retry creation; reusing the key with different content returns 409. Creation failure leaves no partial organization. Main branches are unique per organization; no branch is hard-deleted, and the final active branch cannot be deactivated.

Migration does not guess ownership of legacy bootstrap organizations. They remain inaccessible through membership-based APIs until ownership is explicitly reconciled. New organization/member writes enforce at least one active Owner through deferred triggers; API changes lock the organization row before checking/changing roles or status. Runtime has no membership hard-delete privilege. Local verification upgraded only the isolated test volume; original development/production data was not migrated or deleted.

## Role and branch policy

The owner-only transition is in progress. Its target is to authorize backoffice operations only for active OWNER memberships in the selected active organization. Historical MANAGER, CASHIER, INVENTORY_STAFF and PURCHASING_STAFF memberships and role values remain stored; they do not confer access under the approved policy. Tenant and branch checks remain server responsibilities.

## API contract and frontend map

Organization creation and selection, organization settings and branch operations remain in scope. The transition retires invitation, member and role administration endpoints and their screens, including invitation acceptance. Consult the current router and OpenAPI contract for the integrated endpoint set. Existing invitation and membership records are retained.

In multi-store mode, a signed-in user can create an organization and become its
Owner through onboarding. Single-store mode denies organization creation and
limits selection to the configured existing organization.

## Tenant isolation and caching

- API validates actual global session, membership, fixed permission and branch scope; IDs in URL/body are untrusted and always checked against organization.
- Each tenant transaction sets local organization/user context and explicitly filters tenant tables. Organization/branch forced RLS provides defense in depth; membership/invitation/audit/creation tables are not fully RLS-protected. HTTP tests prove implemented tenant denial, not isolation from arbitrary SQL or compromised bootstrap credentials.
- `smartpos_runtime` is NOLOGIN/NOSUPERUSER/NOBYPASSRLS with scoped operation grants; API selects it after each pool connection. Existing local bootstrap credentials are still privileged and production must use a least-privileged LOGIN role authorized only for this runtime role, separate from migration credentials. No production role was provisioned.
- Organization row locks serialize tenant operations, simplifying owner/revocation consistency but limiting per-tenant concurrency.
- Query keys include user/organization/branch/resource; switch/logout cancels/removes prior caches and does not reuse cross-tenant placeholder data. Only user-scoped org/branch preference IDs enter sessionStorage. Preferences never authorize access.
- Context revalidates on focus/every 30 seconds; stale screens can remain briefly, but every API write independently rechecks. Removed membership/context query failure closes the frontend gate.
- Successful changes audit actor/action/object/branch scope/request ID in the same transaction with runtime SELECT/INSERT-only audit grants. No plaintext secret/token payload is audited. Failed/denied requests are not all persisted to this audit table.

## Verification and remaining gates

Historical Phase 1B evidence: Go policy/validation tests, rollback-only SQL, real Caddy/PostgreSQL/Mailpit integration, frontend cache/onboarding tests and integrated browser scenarios cover onboarding/idempotency, tenant/branch denial, Manager escalation denial, suspension/removal, invitation expiry/replay/email binding/revocation/concurrency, last-owner concurrency, Origin/CSRF and sanitized logs. The historical browser suite checked all six pages at 320/375/640/768/1024/1440/1920px and meaningful mobile/desktop screenshots.

Production TLS/SMTP/deployed IPv6, least-privilege LOGIN credentials, durable queues/outbox, PII retention, broad accessibility/security/load review and CI/deployment certification are not verified. The historical Phase 1B lint run reported three react-refresh warnings (two existing, one new provider export). The Phase 1B catalog-future statement is superseded by the locally verified [Phase 1C catalog](catalog.md), which reuses this authorization engine and adds fixed catalog permissions without implementing inventory or sales.
