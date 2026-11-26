---
name: typescript-quality
description: 'Improve TypeScript types, narrowing and boundary validation in affected code. Use for type design/errors, not broad unsolicited strictness changes.'
metadata:
  origin: local-authored
---

# TypeScript Quality

Inspect existing tsconfig, domain representations and client contracts. Reuse established types and validation helpers; do not alter compiler settings or install a schema library to simplify a local fix.

- Model distinct loading/error/success states and domain variants explicitly where useful. Prefer narrowing over assertions that merely silence the compiler.
- Treat external JSON as untrusted input. Static TypeScript types do not validate runtime payloads; use the existing API/error parsing boundary.
- Avoid any, blanket casts, non-null assertions and suppression directives that hide a real mismatch. Keep optional and nullable meanings aligned with the server.
- Preserve exact money/quantity string/decimal representations, identifiers and units. Never cast a value to a different business meaning.
- Keep API/server state separate from local form state and avoid duplicated generated/manual type definitions.

Read [boundary types](references/boundary-types.md) when shaping request/response types. Verify the affected contract and existing typecheck/tests; a successful build alone does not establish UI or API correctness.
