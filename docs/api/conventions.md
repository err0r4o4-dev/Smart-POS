# API conventions

Canonical OpenAPI: `packages/contracts/openapi.yaml`. Health/system and six Phase 1A `/auth` endpoints exist; planned business groups are not live CRUD.

- `/api/v1`; success `{ "data": ... }`; error `{ "error": { "code", "message", "request_id" } }`; typed health envelopes.
- Server generates `X-Request-ID`, never reflects untrusted IDs. UUID identifiers, UTC RFC3339 timestamps.
- Integer money minor units + ISO currency. Quantity decimal strings + unit. No float money.
- Future pagination: `data`, `page: { next_cursor, has_more }`; limit 1-100/default 25, whitelisted filter/sort and stable ID tie-breaker.
- 400 malformed, 401 unauthenticated, 403 forbidden, 404 absent/tenant-hidden, 409 conflict/idempotency mismatch, 422 validation, 429 throttled, 503 unavailable. Never raw SQL/errors.
- Sessions: HttpOnly/SameSite=Lax cookies (Secure `__Host-` in production); CSRF token + allowed Origin on authenticated writes; expiry/revocation/rate limits. No localStorage tokens. Tenant membership/branch grants are not yet available and no tenant data route is exposed.
- Forgot-password accepts valid addresses with a generic HTTP 202 response after enqueue, not after mail delivery. Unknown accounts, SMTP failure and a saturated delivery queue do not expose account existence. HTTP 202 does not guarantee delivery; operations must monitor worker failures. Invalid input/Origin and rate limits retain their existing error contracts.
- Client IP is resolved at the single configured Caddy peer boundary; untrusted/ambiguous forwarded addresses and all `X-Real-IP` values are ignored. See the security model. Rate-limit thresholds and response schemas are unchanged.
- Critical writes: tenant/actor/operation-scoped Idempotency-Key, request hash, atomic result persistence, unique conflict handling and expiry. Changed payload -> 409. Deduplicate provider events.
- Same-origin, no permissive CORS. Phase 6 internal AI client gets deadlines/service auth and bounded snapshots. Body limits precede public writes.
