# Boundary Types

Trace types through the server contract, API client, query state and form/component before changing them.

- Required, optional and nullable are different contracts. Check real response/error parsing and fixtures, not only compiler inference.
- Keep domain IDs, decimal strings and units distinct; a cast cannot validate business meaning.
- Narrow tagged unions before reading variant-specific fields. Keep unavailable/insufficient-data separate from a valid zero result.
- Validate untrusted JSON with current boundary helpers. Do not add a library or duplicate a contract type just for one call site.
- Preserve query keys and mutation invalidation for the affected organization/branch.
- Exercise malformed and valid boundary inputs through existing tests and run the relevant typecheck.
