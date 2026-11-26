# Terminal logging

Use the normalized viewer for all services in the selected Docker Compose project:

```powershell
npm run stack:logs
npm run stack:logs:follow
npm run stack:logs -- api caddy
npm run stack:logs -- --all --tail 300
```

`COMPOSE_PROJECT_NAME` and normal Compose environment selection still apply. The
viewer only reads logs; it never starts services, rebuilds images, runs migrations,
or changes containers. Stop following with Ctrl+C; containers keep running.

HTTP fields appear first in this order: `method`, `status`, `path`, `request_id`.
They are followed by level, service, message, latency in milliseconds, and time.
Responses with 4xx use WARN and 5xx use ERROR. Non-HTTP events omit HTTP fields
instead of inventing a status or request ID. Native PostgreSQL, migrate, Mailpit,
and check-job lines are normalized into JSON without changing their images.

Successful GET/HEAD health requests are noise in most sessions. The viewer hides
successful `/health/live` and `/health/ready` requests by default; `--all` includes
them. Failures remain visible. Raw application access logs are not filtered.

Go uses its existing slog JSON handler and chi response writer to capture the
actual committed HTTP status, including recovered panics. AI uses Python logging
with a JSON formatter and application middleware; duplicate Uvicorn access logging
is disabled. AI latency measures time to response headers, not streamed body delivery.
Caddy gateway and static web enable access logging and remove request/response
headers and the nested request object, logging method and original path separately.
The gateway records the backend's response `X-Request-ID` when available; its own
generated gateway ID is the fallback for upstream failures. No client-provided
request ID is trusted by the API or AI. Web responses include a generated ID.

Runtime logs can have a different native key order. The viewer orders HTTP keys,
converts Caddy duration to milliseconds, uses native or Docker timestamps, excludes
unrecognized structured attributes, and redacts common credentials, email addresses,
URL queries/userinfo, and database statement/detail fields from displayed messages.
Do not intentionally log private data: text redaction cannot guarantee removal of
every possible sensitive value. The viewer is a display layer, not a storage or
retention policy, and does not modify previously stored Docker logs.

Use `npm run stack:logs:raw` for the original output, or
`npm run stack:logs -- --raw --follow api` to follow it. Raw logs may contain
sensitive information and should not be shared without review. Browser React
console logs stay in browser DevTools; this does not introduce client telemetry.

Existing containers need rebuilt images for API/AI/web changes and a gateway reload
or restart for its mounted Caddyfile. This change does not perform those operations.
Do not run the full stack as a logging check: its startup includes migrations.

Checks: `npm run test:logs`, focused Go httpx/transport tests, AI pytest/Ruff, and
Caddy validation using the pinned Caddy image without starting the application stack.
`node tests/logging/caddy-smoke.mjs` tests gateway/web requests in one disposable
container with no external network, exposed ports, application database, or migrations.
It requires the existing `caddy:2.10-alpine` image and does not pull images.
