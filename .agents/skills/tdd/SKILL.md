---
name: tdd
description: 'Use test-first vertical slices for requested behavior changes with existing test seams. Not for read-only requests or artificial tests of prose.'
license: MIT
metadata:
  origin: adapted-from-pinto
  upstream: mattpocock/skills
---

# Test-Driven Development

Read the task, repository rules, existing tests and affected public behavior. Maintain the task checklist required by AGENTS.md; do not create additional trackers or delete the roadmap.

1. Define acceptance cases from the requested behavior and inspected callers. Ask only when a material ambiguity remains, not for approval of every routine step.
2. Write one focused test that fails for the intended missing behavior or reproduced bug. Confirm the failure reason where the environment allows it; an infrastructure failure is not a valid RED result.
3. Make the minimum cohesive implementation that passes that case.
4. Repeat in vertical slices; avoid writing a large speculative test suite before learning from the first working path.
5. Refactor affected code only with the relevant tests passing. Preserve tests and avoid mock-heavy assertions about implementation internals.

Use [behavioral tests](tests.md) and [mocking boundaries](mocking.md) as community examples, not a prohibition on needed domain/database invariant checks. Documentation-only changes use metadata/reference/format checks; configuration behavior uses existing suitable checks. A missing test framework is not permission to install one.

Report RED/GREEN evidence honestly, including tests not run or blocked. Keep unresolved TODO items; remove only the completed task section after verification.
