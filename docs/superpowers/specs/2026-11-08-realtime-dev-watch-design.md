# Real-Time Full-Stack Development Watch Design

- **Date**: 2026-11-08
- **Status**: Approved

## Intent & Why

Developers want edits across both the React frontend (`apps/web`) and the Go API (`apps/api`) to build and appear in real time at the local gateway (`http://localhost:8088`) without manually rebuilding container images after every save.

## Goals, Non-goals, and Anti-goals

- **Goals**:
  - Live browser updates via Vite HMR for `apps/web` edits routed through the Caddy gateway (`:8088`).
  - Automatic incremental Go recompilation and graceful process swap for `apps/api` `.go` edits inside Docker Compose Watch.
  - Single unified dev-stack workflow (`stack:dev`, `stack:dev:up`, `stack:dev:watch`) covering `api`, `web`, and `caddy`.
- **Non-goals**:
  - Live watch changes to `apps/ai` (currently health-only internal boundary).
  - Changing base production/default service definitions or network topology in `docker-compose.yml`.
- **Anti-goals**:
  - Automatically triggering database migrations or restarting `postgres` from `stack:dev*` commands.
  - Syncing host `.env*` secrets, compiled binaries, or build caches into containers.
  - Letting a Go syntax/compile error terminate the `api` development container and break the Compose Watch loop.

## Constraints

- Run development containers as non-root users (`node` for `web`, `app` for `api`).
- Introduce zero external Go module dependencies (`go.mod` unchanged); use `golang:1.26-alpine` standard tooling and pre-warmed Go build cache.
- Preserve production CSP in `infra/caddy/Caddyfile`; isolate HMR inline/WebSocket relaxations to `infra/caddy/Caddyfile.dev`.
- Keep `--no-deps` on `stack:dev` and `stack:dev:up` so `postgres` and `migrate` are never started or mutated implicitly.

## Approaches Considered

1. **Docker Compose Watch for both `web` (Vite HMR) and `api` (Go incremental rebuild supervisor) behind Caddy `:8088` (Selected)** — Fast incremental updates (<1s cached Go rebuilds, instant HMR), no host Go toolchain required, preserves exact gateway/cookie/CSRF/proxy topology.
2. **Hybrid host-native Vite + Go against Docker PostgreSQL** — Rejected due to host Go toolchain requirement, differing origin/proxy topology vs `:8088`, and documented Docker Desktop loopback binding caveats on internal networks.
3. **`vite build --watch` + whole-container `api` restart** — Rejected due to slow full bundling, loss of UI state/manual browser refreshes, and container crash loops on transient compile errors.

## Approved Design

- **`apps/api/scripts/dev-watch.sh` & `apps/api/Dockerfile`**:
  - Add a non-root `development` stage in `apps/api/Dockerfile` (`USER app`, writable `GOCACHE=/tmp/go-build` pre-warmed with an initial `CGO_ENABLED=0 go build`).
  - `apps/api/scripts/dev-watch.sh` computes a source fingerprint across `.go`, `go.mod`, and `go.sum`, debounces file-sync bursts, builds `/tmp/smartpos-server`, gracefully terminates the prior server (`SIGTERM` + wait), launches the updated binary, forwards container stop signals, and emits sanitized JSON logs compatible with `scripts/log-format.mjs` while staying alive on compile errors.
- **`docker-compose.dev.yml`**:
  - Add `api` service override targeting `build.target: development` (`init: true`) with `develop.watch` rules: `sync` `./apps/api` to `/src` (ignoring `.env*`, `.cache/`, `server`, `*.exe`, `Dockerfile`, `go.mod`, `go.sum`, `scripts/dev-watch.sh`), `sync+restart` on `./apps/api/scripts/dev-watch.sh`, and `rebuild` on `./apps/api/Dockerfile`, `./apps/api/go.mod`, `./apps/api/go.sum`.
- **`package.json`, `scripts/dev-stack.test.mjs`, and `README.md`**:
  - Update `stack:dev`, `stack:dev:up`, and `stack:dev:watch` to target `api`, `web`, and `caddy` (with `--no-deps` preserved on `up` commands).
  - Extend `scripts/dev-stack.test.mjs` to verify `api` development target, non-root execution, watch sync/ignore/rebuild rules, `--no-deps` database protection, and `dev-watch.sh` behavior.
  - Update `README.md` development watch section to reflect unified frontend + Go API live updates.
