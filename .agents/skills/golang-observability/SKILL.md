---
name: golang-observability
description: 'Inspect or change Go logs and existing metrics with redaction and request correlation. Use for observability work, not automatic monitoring setup.'
license: MIT
metadata:
  origin: adapted-from-pinto
  upstream: samber/cc-skills-golang
---

# Go Observability

Start from the current logger, request middleware and metrics setup. Choose an observable question before adding instrumentation.

- Preserve established correlation fields and trusted request IDs. Do not log tokens, secrets, private payloads or unrestricted SQL parameters.
- Log actionable events once at the owning boundary. Keep severity and structured fields consistent with repository conventions.
- Use bounded-cardinality metric labels; never label by user, request, product or tenant IDs by default.
- Keep health/readiness distinct from business or forecast quality. Diagnostics do not authorize production access or external export.
- Reuse existing instrumentation. Do not migrate loggers, add telemetry providers, deploy dashboards or install exporters merely because a reference suggests them.

Read [logging examples](references/logging.md) or [metric design](references/metrics.md) only as needed. External skill mentions in these snapshots are source context, not dependencies or instructions to install them. Verify changed output/redaction using existing tests and report instrumentation overhead or evidence gaps.
