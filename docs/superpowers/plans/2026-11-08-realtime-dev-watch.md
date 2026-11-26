# Real-Time Full-Stack Development Watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Main Agent inline execution per repository `CLAUDE.md` R05/R06) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not run `git commit` unless the user explicitly requests it.

**Goal:** Enable real-time auto-rebuild and live reload across both the React frontend (`apps/web`) and Go API (`apps/api`) behind the Caddy gateway (`http://localhost:8088`) using Docker Compose Watch.

**Architecture:** Extend the existing `docker-compose.dev.yml` frontend HMR setup with a non-root `development` stage in `apps/api/Dockerfile` driven by a zero-dependency POSIX supervisor (`apps/api/scripts/dev-watch.sh`). Compose Watch syncs source changes into `web` (Vite HMR) and `api` (cached incremental `go build` + graceful `SIGTERM` process swap) while `--no-deps` protects `postgres` and `migrate` from implicit execution.

**Tech Stack:** Docker Compose Watch, Go 1.26 (`golang:1.26-alpine`), POSIX `sh`, Vite 8 HMR, Caddy 2.10, Node.js `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-08-realtime-dev-watch-design.md`

## Global Constraints

- Run development containers as non-root users (`node` for `web`, `app` for `api`).
- Introduce zero external Go module dependencies (`apps/api/go.mod` unchanged).
- Preserve production CSP in `infra/caddy/Caddyfile`; isolate dev HMR WebSocket/inline rules to `infra/caddy/Caddyfile.dev`.
- Keep `--no-deps` on `stack:dev` and `stack:dev:up` so `postgres` and `migrate` are never implicitly started or migrated.
- Never sync `.env*`, `.cache/`, or host binaries (`server`, `*.exe`) into containers.
- Do not run `git commit` or `git push` without explicit user authorization (`CLAUDE.md` / `AGENTS.md`).

## Review Focus

1. **Broken Go save mid-edit**: Saving invalid `.go` syntax logs a structured `ERROR` (`event: "dev_build_failed"`), keeps the container alive and the prior healthy server process running, and recovers automatically on the next valid save.
2. **Multi-file sync burst**: Syncing multiple `.go` files back-to-back waits for source fingerprint stability before running `go build` so partial syncs do not trigger spurious restarts.
3. **Graceful `SIGTERM` forwarding**: Stopping or restarting the `api` container forwards `SIGTERM` from `dev-watch.sh` to the active server process and exits `0` cleanly.
4. **Secret and artifact exclusion**: `.env*`, `.cache/`, `server`, `*.exe`, `Dockerfile`, `go.mod`, `go.sum`, and `scripts/dev-watch.sh` are excluded from `./apps/api` directory sync (`go.mod`, `go.sum`, and `Dockerfile` trigger `rebuild`; `scripts/dev-watch.sh` triggers `sync+restart`).
5. **Database migration isolation**: `stack:dev` and `stack:dev:up` retain `--no-deps` targeting only `api web caddy`, leaving `postgres` and `migrate` untouched.

---

### Task 1: Full-Stack Compose Watch Configuration & Go Auto-Rebuild Supervisor

**Files:**

- Create: `apps/api/scripts/dev-watch.sh`
- Modify: `apps/api/Dockerfile`
- Modify: `docker-compose.dev.yml`
- Modify: `package.json`
- Test: `scripts/dev-stack.test.mjs`

**Interfaces:**

- Produces:
  - `apps/api/scripts/dev-watch.sh` supporting env overrides for hermetic testing:
    - `SMARTPOS_DEV_WATCH_SRC` (default `/src`)
    - `SMARTPOS_DEV_WATCH_BIN` (default `/tmp/smartpos-server`)
    - `SMARTPOS_DEV_WATCH_INTERVAL` (default `1` second)
    - `SMARTPOS_DEV_WATCH_BUILD_CMD` (default `go build -o "$BIN.next" ./cmd/server`)
  - `apps/api/Dockerfile` target `development` (`USER app`, `GOCACHE=/tmp/go-build`, `CGO_ENABLED=0`, `CMD ["sh", "/src/scripts/dev-watch.sh"]`)
  - `docker-compose.dev.yml` service `api` (`build.target: development`, `init: true`, `develop.watch`)
  - `package.json` scripts:
    - `stack:dev`: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build --watch --no-deps api web caddy`
    - `stack:dev:up`: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d --wait --no-deps api web caddy`
    - `stack:dev:watch`: `docker compose -f docker-compose.yml -f docker-compose.dev.yml watch --no-up --prune=false api web`

- [ ] **Step 1: Write failing static and behavioral tests in `scripts/dev-stack.test.mjs`**

Update `scripts/dev-stack.test.mjs` to assert:

- `Object.keys(development.services).sort()` equals `['api', 'caddy', 'web']`.
- `development.services.api.build.target === 'development'`, `base.services.api.build.target === 'runtime'`, `development.services.api.init === true`, `development.services.api.volumes === undefined`.
- `development.services.api.develop.watch` contains:
  - `sync` for `./apps/api` -> `/src` (`initial_sync: true`) ignoring `['.cache/', '.env*', 'server', '*.exe', 'Dockerfile', 'go.mod', 'go.sum', 'scripts/dev-watch.sh']`.
  - `sync+restart` for `./apps/api/scripts/dev-watch.sh` -> `/src/scripts/dev-watch.sh` (`initial_sync: true`).
  - `rebuild` rules across `web` and `api` for `./apps/api/Dockerfile`, `./apps/api/go.mod`, `./apps/api/go.sum`, `./apps/web/Dockerfile`, `./apps/web/package.json`, `./package-lock.json`, `./package.json`.
- `manifest.scripts['stack:dev']` and `manifest.scripts['stack:dev:up']` match `/--no-deps api web caddy$/`; `manifest.scripts['stack:dev:watch']` matches `/watch --no-up --prune=false api web$/`.
- `apps/api/Dockerfile` defines `FROM base AS development`, `USER app`, `GOCACHE=/tmp/go-build`, pre-builds `/tmp/smartpos-server`, runs `CMD ["sh", "/src/scripts/dev-watch.sh"]`, and retains `FROM base AS check` and `FROM alpine:3.23 AS runtime`.
- Behavioral test spawning `sh apps/api/scripts/dev-watch.sh` against a disposable temp directory verifies:
  1. Initial build starts the server process and logs `dev_server_started`.
  2. Modifying a `.go` file to fail compilation logs `dev_build_failed` while keeping the original server PID running, and modifying `.env` does not trigger a rebuild.
  3. Fixing the `.go` file rebuilds, terminates the old PID, starts a new PID (`dev_server_reloaded`), and sending `SIGTERM` to `dev-watch.sh` terminates the active child PID cleanly with exit code `0`.

- [ ] **Step 2: Run `npm run test:dev-stack` to verify RED**

Run: `npm run test:dev-stack`
Expected: FAIL on missing `api` service in `docker-compose.dev.yml` and missing `apps/api/scripts/dev-watch.sh`.

- [ ] **Step 3: Implement `apps/api/scripts/dev-watch.sh`, `apps/api/Dockerfile`, `docker-compose.dev.yml`, and `package.json`**

1. Create `apps/api/scripts/dev-watch.sh` (LF line endings):
   - Fingerprint only `*.go`, `go.mod`, and `go.sum` under `$SRC_DIR` (excluding `.cache` and hidden directories) using `find` + `stat`/`cksum`.
   - On detected fingerprint change, sleep briefly (`0.2s` default via `SMARTPOS_DEV_WATCH_DEBOUNCE`) and re-read until two consecutive fingerprints match before building.
   - Build to `$BIN.next`; on failure, sanitize single-line compiler message into JSON `{"level":"ERROR","service":"api","event":"dev_build_failed","msg":"..."}` and preserve running `$server_pid`.
   - On success, if `$server_pid` is alive send `kill -TERM "$server_pid"` and `wait "$server_pid"`, move `$BIN.next` to `$BIN`, execute `$BIN &`, and emit JSON `dev_server_started` / `dev_server_reloaded`.
   - Trap `INT` and `TERM` to forward `TERM` to `$server_pid`, `wait`, and `exit 0`.
2. Update `apps/api/Dockerfile` to add the non-root `development` stage between `base` and `check`.
3. Update `docker-compose.dev.yml` and `package.json` with the exact `api` watch rules and `stack:dev*` scripts.

- [ ] **Step 4: Run `npm run test:dev-stack` and `npm run test:logs` to verify GREEN**

Run: `npm run test:dev-stack && npm run test:logs`
Expected: PASS (all dev-stack static + behavioral tests and log-format tests pass).

---

### Task 2: Documentation Synchronization & Verification

**Files:**

- Modify: `README.md:177-218`

**Interfaces:**

- Consumes: `stack:dev`, `stack:dev:up`, `stack:dev:watch` scripts from Task 1.
- Produces: Updated live-development setup section in `README.md`.

- [ ] **Step 1: Update `README.md` live-watch section**

Update the `Frontend auto-update through the gateway` section in `README.md` to `Live auto-update through the gateway (web + API)` (preserving surrounding structure and anchor compatibility if referenced), documenting:

- `npm run stack:dev` (and detached `npm run stack:dev:up` + `npm run stack:dev:watch`) updates both `apps/web` (Vite HMR) and `apps/api` (Go incremental rebuild + graceful restart) at `http://localhost:8088`.
- `--no-deps` targets `api`, `web`, and `caddy` only — `postgres`, `migrate`, and `ai` are not started or migrated implicitly.
- Returning to built containers uses `docker compose up --build -d --wait --no-deps api web caddy`.

- [ ] **Step 2: Run formatting, contract, and test verification**

Run:

- `npm exec -- prettier --check docker-compose.dev.yml package.json scripts/dev-stack.test.mjs README.md`
- `npm run test:dev-stack`
- `npm run contracts:check`
- `git diff --check`

Expected: All checks exit `0` with no formatting or whitespace errors (and LF line endings preserved on `apps/api/scripts/dev-watch.sh`).
