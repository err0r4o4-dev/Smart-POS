# SmartPOS Claude Execution Guide

Use `AGENTS.md` for project rules and `.agents/skills/README.md` for task-to-skill
routing. Canonical workflows live in `.agents/skills`. The 32 corresponding
`.claude/skills/<name>/SKILL.md` adapters point to those canonical files. Do not
duplicate workflow bodies or policy in adapters.
Resolve a skill's bundled `scripts/` and `references/` from its canonical skill
directory. Project application, database and documentation paths are relative to
the repository root unless explicitly stated otherwise. For example,
`scripts/hitl-loop.template.sh` in `diagnosing-bugs` is under that skill's directory.
Bundled scripts are not run or installed automatically.

If automatic discovery is unavailable, use the canonical path explicitly. Do not
install tools or change configuration just to enable discovery.
