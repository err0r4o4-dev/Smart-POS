---
name: diagnosing-bugs
description: Diagnosis loop for hard bugs and performance regressions. Use when
  the user says "diagnose"/"debug this", or reports something
  broken/throwing/failing/slow.
---

# diagnosing-bugs Claude Adapter

Read `.agents/skills/diagnosing-bugs/SKILL.md` completely before using this skill.
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
