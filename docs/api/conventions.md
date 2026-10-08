# API conventions

Canonical OpenAPI: `packages/contracts/openapi.yaml`. Only health/system endpoints exist. Planned groups are not live CRUD.

- `/api/v1`; success `{ "data": ... }`; error `{ "error": { "code", "message", "request_id" } }`; typed health envelopes.
- Server generates `X-Request-ID`, never reflects untrusted IDs. UUID identifiers, UTC RFC3339 timestamps.
- Integer money minor units + ISO currency. Quantity decimal strings + unit. No float money.
- Future pagination: `data`, `page: { next_cursor, has_more }`; limit 1-100/default 25, whitelisted filter/sort and stable ID tie-breaker.
- 400 malformed, 401 unauthenticated, 403 forbidden, 404 absent/tenant-hidden, 409 conflict/idempotency mismatch, 422 validation, 429 throttled, 503 unavailable. Never raw SQL/errors.
- Sessions: HttpOnly/Secure/SameSite=Lax cookies; CSRF token + Origin validation on writes; expiry/rate limits. No localStorage tokens. Backend verifies tenant membership/branch grants.
- Critical writes: tenant/actor/operation-scoped Idempotency-Key, request hash, atomic result persistence, unique conflict handling and expiry. Changed payload -> 409. Deduplicate provider events.
- Same-origin, no permissive CORS. Phase 6 internal AI client gets deadlines/service auth and bounded snapshots. Body limits precede public writes.
