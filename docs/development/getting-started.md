# Getting started

## Docker-first

Docker Desktop Linux engine and Compose v2; Node 24/npm 11 for frontend commands. Root package-lock and AI uv.lock freeze application dependencies; Go module sums verify downloads. Container image tags are version-family pins, not immutable digests; freeze reviewed digests before production release.

Copy `.env.example` to `.env` if you want custom ports. Defaults run locally without that file. Values are local examples, not production secrets. Never commit `.env`. Avoid exposing local port bindings. If port conflicts occur, change WEB_PORT/API_PORT/POSTGRES_PORT/GATEWAY_PORT before startup.

`npm ci` -> `npm run stack:up` -> localhost:8088. Startup sequence: PostgreSQL healthy -> migration up finishes -> Go ready (ping + schema) -> Caddy. AI starts independently and is not a Go availability dependency. `npm run migrate` is safe to rerun (no change); never run down/drop/volume removal automatically.

## Frontend development

Stop the container web service or choose a different WEB_PORT before `npm run dev` (Vite 5173). Vite proxies /api and /health to 127.0.0.1:8080. If API_PORT changes, update the local Vite proxy target. Browser uses same-origin relative paths, never internal container hostnames. `DEV_ORIGINS` must include the Vite origin for auth writes. Local password reset messages appear in Mailpit on the loopback `MAILPIT_PORT` (default 8025); never use Mailpit as production delivery.

## Individual services

- Go 1.26: in `apps/api`, set DATABASE_URL and optional API_ADDR, then `go run ./cmd/server`. Database URL is required and never logged. Format/vet/test/build via `npm run verify:api` container target or equivalent Go commands.
- Python 3.13 + uv 0.10: in `apps/ai`, `uv sync --frozen` then `uv run uvicorn app.main:app --host 127.0.0.1 --port 8001`. Optional AI_SERVICE_NAME; no DB/model credentials. `npm run verify:ai` uses a test image.
- AI Docker port is internal only; use `docker compose exec ai ...` for local health. No public forecast endpoint or trained model exists.

The per-service `.env.example` files document host environment variables; Go/FastAPI do not automatically load those files. Set variables in the shell or an approved environment loader. Compose uses the root environment settings. Browser tests accept E2E_BASE_URL for custom gateway ports; the resilience script intentionally targets the default local gateway port 8088 only.

## Checks

`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. `npx playwright install chromium` once, then `npm run e2e` against a running gateway. `npm run verify:api` and `npm run verify:ai` automatically build their check images before running. `npm run verify:integration` uses the running local stack. `npm run verify:resilience` temporarily stops AI/PostgreSQL/API to assert real outage and graceful shutdown behavior, restoring services with finally blocks; use only against this disposable local development stack.

`npm run stack:logs` reads logs; do not publish secret-bearing environment output. `npm run stack:down` stops only this Compose project and preserves named data volume. Tests use synthetic rollback-only SQL; no production URL is accepted by integration Compose configuration.

## Isolated Phase 1A authentication verification

Run from the repository root, using Docker Desktop Linux containers and the already installed Playwright Chromium. Do not target a production database or change the rate-limit thresholds.

```powershell
$env:POSTGRES_PORT='15432'
$env:API_PORT='18080'
$env:WEB_PORT='15173'
$env:GATEWAY_PORT='18088'
$env:MAILPIT_PORT='18025'
$env:PUBLIC_ORIGIN='http://localhost:18088'
docker compose -p smartpos-auth-test up --build -d --wait
docker pull node:24-alpine
docker compose -p smartpos-auth-test --profile checks run --build --no-deps --rm api-check
docker compose -p smartpos-auth-test --profile checks run --no-deps --rm auth-integration-check
npm run verify:auth
```

If another project already uses the proxy subnet, choose an unused `PROXY_SUBNET` and matching fixed Caddy/API addresses before starting this isolated project. Existing volumes are preserved and migration up is rerunnable; no down/drop or counter reset is part of verification. `docker pull` supplies the same Node family already used by the web build; BuildKit's base-image cache alone may not provide its `docker run` tag.

`verify:auth` runs the API auth flow, then all Playwright tests with auth enabled. Disposable, non-root, read-only Node clients on the isolated edge network forward to the real Caddy gateway. Each suite/client receives one real IP with no live prior test bucket; that IP is fixed for all attempts, including explicit 429/spoofing checks. Counters and account limits are never cleared. The direct-API fixture additionally joins data, not the trusted proxy network. Only fixture containers are removed in `finally`; synthetic accounts/rate counters and the database volume remain.

The API flow deliberately stops **only the isolated Mailpit** to check SMTP failure responses and sanitized application logs, then restores it in `finally`. Do not run overlapping auth suites against the same project during this outage test. Mailbox access uses the API container's internal Mailpit interface; no public mailbox binding is required. Reset tests poll for a newly delivered message rather than assuming synchronous SMTP, and expiry fixtures preserve the database's `expires_at > created_at` constraint.

Screenshots/Playwright reports live under ignored `test-results`/`playwright-report`. Traces can contain synthetic test session/reset material; do not publish them as production-safe logs. Mailpit host UI binding, production TLS/SMTP and production hardening are separate verification gates.
