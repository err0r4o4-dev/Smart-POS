# Security model

Phase 1A implements global identity endpoints and a protected account page. The Phase 0 auth preview remains presentation-only; no tenant-data endpoints are exposed. Frontend guard defaults deny; backend independently validates the session for authenticated API access.

Phase 1A uses Argon2id with random salts and bounded input, hashed random session tokens in PostgreSQL, a 24-hour default absolute expiry (configurable 1-720 hours), revocation, HttpOnly/SameSite=Lax cookies and Secure `__Host-` cookies in production HTTPS. Authenticated writes check the allowed Origin and a per-session CSRF header. Public auth writes check Origin and JSON input; PostgreSQL counters limit login to five attempts per account/IP in ten minutes and other auth requests by scope. One-time hashed reset tokens expire in 15 minutes; reset atomically changes the password and revokes sessions. Neither session nor reset tokens are stored in browser storage or application logs. No session rotation endpoint is implemented or required for the fixed-expiry design.

Password reset returns the same HTTP 202 envelope for eligible and unknown accounts, including an SMTP outage. The public path performs validation and a non-blocking enqueue only; account lookup, token issuance and SMTP delivery run in a separate worker. There are no artificial response sleeps. The queue holds 64 normalized addresses; saturation logs a generic failure and still returns the generic response. Delivery uses a 12-second worker context and a maximum 10-second SMTP connection deadline, respecting earlier context deadlines/cancellation. Queue entries are not durable, retries are not automatic, and saturation/process restart can lose pending deliveries. Operators must monitor generic queue/processing failures. Local Mailpit is development-only; production requires authenticated STARTTLS SMTP.

## Trusted proxy policy

- `AUTH_TRUSTED_PROXY_IP` accepts one exact, non-loopback IPv4/IPv6 address. Production requires it; host development can omit it and ignore all forwarded client addresses.
- Compose puts only Caddy and Go on `proxy`, with fixed `CADDY_PROXY_IP` and `API_PROXY_IP` values inside `PROXY_SUBNET`. Do not attach arbitrary containers to that network. A Docker administrator can change networking and is outside the HTTP attacker boundary.
- Go canonicalizes the socket peer and trusts `X-Forwarded-For` only when that peer equals the configured Caddy address. Exactly one header containing one valid, non-unspecified/non-multicast address without an IPv6 zone is accepted. Duplicate headers, lists, malformed or missing values fall back to the socket peer. IPv4-mapped addresses are canonicalized. `X-Real-IP` is never used.
- Caddy's standard reverse-proxy forwarding behavior is unchanged. Incoming forged headers cannot select a new bucket through Caddy; direct/untrusted peers cannot impersonate forwarded clients. No broad private-network CIDR is trusted.
- Login remains five attempts per IP/account in ten minutes; the account bucket also limits attacks spread across independent clients. `Retry-After` is a conservative full-window value, not the exact remaining time. Clients behind the same NAT naturally share a public-IP bucket; a trusted proxy cannot distinguish identities that the network does not provide.
- Direct API ports remain loopback-only in the development Compose topology. Direct requests are attributed to their real peer even if they supply Caddy-like headers. Vite/localhost forwarding is not silently promoted to a trusted proxy.

The 2026-10-09 scoped authentication review and integration checks found the original shared-proxy bucket and synchronous-delivery timing issue resolved. Tests cover fixed IP/account limits, independent real clients, spoofing, CSRF/Origin, token expiry/replay, revocation, cookie policy and sanitized application logs. This is not a production security certification or a statistical side-channel analysis.

Phase 1B will define OWNER, MANAGER, CASHIER, INVENTORY_STAFF and PURCHASING_STAFF roles. Tenant membership/branch grants are not yet implemented or asserted by the auth session.

Queries scope tenant/branch; composite FKs/non-owner RLS add defense. Audit actor/action/object/outcome/request ID without secrets. Define personal-data retention/access before collection.

Phase 0: loopback ports, internal AI without DB credentials, bounded timeouts, generated IDs, generic errors, safe panic recovery, security headers/CSP, non-root app containers, named PostgreSQL volume.

Local bootstrap DB user is privileged and not production-safe. No compliance/hardening claim. Production needs secret management, least privilege, TLS/cookies, threat review, scanning, abuse controls, retention and verified backups. Never expose local Compose publicly.
