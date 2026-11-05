---
name: triage
description: 'Sort multiple bug reports or feature requests by evidence, impact and scope. Use for prioritization, not automatic issue-tracker writes.'
license: MIT
metadata:
  origin: adapted-from-pinto
  upstream: mattpocock/skills
---

# Triage

Separate distinct reports before attempting fixes. Use the project's vocabulary and current evidence, not labels as proof.

For each report record expected/actual behavior, reproduction/evidence, affected boundary, impact, confidence and dependencies. Distinguish data-integrity/authorization risks, broken core workflows, degraded optional features and cosmetic issues without inventing severity rules.

- Identify duplicates and common causes only when evidence supports the relationship.
- Prioritize the smallest useful investigation or acceptance step. For an issue
  under investigation, use `superpowers:systematic-debugging` by default when
  available. Use `diagnosing-bugs` as requested for hard bugs or performance work
  to build and minimize a deterministic, red-capable loop, with its optional HITL
  template when human interaction is needed. It is a standalone fallback when the
  plugin is unavailable. Combine overlapping steps without duplicate loops.
- Separate confirmed defects, hypotheses, missing environment prerequisites and requested enhancements.
- For read-only triage, return findings in chat. Creating issues, posting comments, assigning people, creating files or modifying code requires explicit scope.
- Do not use an issue-tracker state machine, external connector or sub-agent unless the task actually calls for it and authorization is present.

Deliver a concise ordered list with evidence, proposed next action and unresolved questions. Do not silently convert triage into implementation.
