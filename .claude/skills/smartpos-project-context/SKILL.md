---
name: smartpos-project-context
description: Orient SmartPOS work by locating actual module ownership,
  workspaces, contracts, and verification evidence. Use for project-flow
  explanations, cross-domain scoping, or unclear ownership; do not load the full
  project history for small localized tasks.
---

# smartpos-project-context Claude Adapter

Read `.agents/skills/smartpos-project-context/SKILL.md` completely before using this skill.
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
