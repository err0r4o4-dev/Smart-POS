---
name: golang-code-style
description: 'Improve idiomatic Go readability and formatting in affected code. Use for style work, not an unsolicited architecture rewrite.'
license: MIT
metadata:
  origin: adapted-from-pinto
  upstream: samber/cc-skills-golang
---

# Go Code Style

Read the repository rules, affected code, and Go module before editing. Keep established package responsibilities and naming; use the standard library and existing helpers instead of introducing abstractions for hypothetical reuse.

- Prefer explicit control flow, short cohesive functions, and immediate error handling. Avoid stuttering, hidden side effects, broad interface hierarchies, and speculative generics.
- Follow current repository naming and comment conventions; imported examples do not override them.
- Format only changed Go files with the existing toolchain. Do not install linters or apply repository-wide autofixes for a small change.
- Preserve tests, request context, authorization, exact money/quantity types, and public contracts while simplifying code.

Read [style details](references/details.md) only for relevant naming, function, or package questions. These community examples are advisory; existing repository rules and the requested scope take precedence.

Report the files and conventions affected and the formatting/checks actually performed.
