---
name: tdd
description: Use test-first vertical slices for requested behavior changes with
  existing test seams. Not for read-only requests or artificial tests of prose.
---

# tdd Claude Adapter

Read `.agents/skills/tdd/SKILL.md` completely before using this skill.
That repository-root-relative file is the canonical workflow, reference map,
verification guidance, and output contract.

Resolve bundled scripts and references relative to the canonical skill directory;
project application, database, and documentation paths are repository-root relative.

Follow applicable AGENTS.md, CLAUDE.md, the current task scope, and actual execution
permissions. Skills never grant authorization or override required checks,
independent review, or host controls. Load only task-relevant references, combine
overlapping procedures without duplicate loops, and do not run examples automatically.

This adapter contains no independent workflow. If the canonical file is unavailable,
report its missing path instead of inventing a replacement.
