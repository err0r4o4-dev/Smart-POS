# Manual Contract Checklist

Use the repository's current OpenAPI version and conventions rather than copying a new format.

- Compare the route inventory with actual router registration and authentication middleware.
- Compare request parsing/validation with required fields, enum values, units and bounds.
- Compare success and error output with status codes, envelopes, nullability and field types.
- Check tenant/branch authorization and replay/idempotency requirements when the endpoint posts business records.
- Find all affected callers; update generated/manual client types only through the existing workflow.
- Check pagination, filtering and ordering together with their default and invalid cases.
- Include compatibility and failure-case tests at the owning boundary.
- Run the existing inventory/schema check, then relevant producer/consumer tests when authorized.

Swagger code generation and annotation scaffolding are not part of this repository's workflow. For a read-only contract inspection, report disagreements without editing files.
