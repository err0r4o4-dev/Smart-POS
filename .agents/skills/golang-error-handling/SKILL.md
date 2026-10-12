---
name: golang-error-handling
description: 'Implement or inspect Go error wrapping, classification, cancellation and HTTP error mapping. Use when error behavior is affected.'
license: MIT
metadata:
  origin: adapted-from-pinto
  upstream: samber/cc-skills-golang
---

# Go Error Handling

Trace the error from dependency to service to transport and consumer. Preserve established public error/status conventions and keep internal diagnostics out of client responses.

- Wrap with context using error chains; use errors.Is/errors.As for classification rather than matching strings.
- Preserve cancellation/deadline identity. Separate validation, not-found, forbidden, conflict, unavailable, and unexpected failures as the existing contract requires.
- Return errors from library/domain code instead of calling panic or terminating the process. Recover only at an established transport/process boundary.
- Avoid duplicate logging at every layer and never include credentials, tokens, raw database errors, or private request bodies in public output.
- Add behavior tests for the changed mapping and relevant failure path before implementation.

Read [error wrapping](references/error-wrapping.md) for examples. Follow repository rules over community defaults and do not change an API contract merely to simplify error handling.
