# Local operation, not production deployment

Compose provides web 5173, API 8080, PostgreSQL 5432, gateway 8088 on loopback. Python listens on internal 8001 only. data/intelligence networks are internal; Caddy only proxies web and API. Browser routes retain /api/v1 prefix. Vite is optional host development, not the container web server.

Named postgres-data volume persists. Startup migration is additive; no reset, seed overwrite or volume deletion command is provided. Changing bootstrap credentials after a volume exists does not rotate existing database credentials automatically.

Health commands: `docker compose ps`, gateway `/health/live`, `/health/ready`, `/api/v1/system`; AI health via exec/internal check. Readiness returns 503 if DB ping/schema fails, while liveness remains independent. API SIGTERM drains in-flight requests up to 10s; Python uses uvicorn shutdown. Caddy retry/unavailable behavior must not be mistaken for payment success.

Redis/MinIO are not required in Phase 0. Add object storage for real upload use cases with limits/access controls; add durable jobs/cache only when needed. Production TLS, domains, secret management, runtime DB roles, storage backups/restore, monitoring and release procedures belong to Phase 7, with earlier security gates as features are introduced.
