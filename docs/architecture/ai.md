# Internal intelligence boundary

Phase 0 only: Python FastAPI live/ready health. Health returns strict `{ status: "ok" | "ready", service: string }`, generated X-Request-ID and no-store. Errors use code/message/request_id. Unknown prediction routes return 404; no trained model or synthetic prediction exists. Readiness currently has no external required dependencies. Docs/OpenAPI HTTP endpoints are disabled; service is on an internal network without published port.

Phase 6 target request: authorized organization/branch snapshot with product/base unit, UTC time window, bounded daily demand history, inventory/reorder context, requested method and input schema version. No raw PII, passwords, full database access or arbitrary query capability. Go authenticates/authorizes and bounds snapshots; internal calls need service authentication, request correlation, deadline/retry policy, output validation and idempotent run tracking.

Target response: run_id, schema_version, model_name/model_version, generated_at UTC timestamp, training window, forecast horizon/unit, point estimates and uncertainty where supported, data-quality indicators, explanation metadata and provenance. `insufficient_data` is an explicit non-prediction result with minimum-history guidance; never fabricate a confident forecast. Deterministic reorder calculations remain distinct from trained probabilistic forecasts. Model registry/version ownership resides in Python, business acceptance/persistence in Go.

AI recommends demand/reorder/shelf/anomaly actions only. It cannot approve orders, finalize payments or mutate stock. POS works during AI outages. No ML libraries, job workers or database connection are installed in Phase 0.
