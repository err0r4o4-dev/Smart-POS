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

## Task Lifecycle & TODO.md Management (กฎการจัดการงานใน TODO.md)

- **Task Tracking**: When planning or executing tasks, create or safely extend `TODO.md` with a clearly scoped checklist for the active task.
- **Task Closure & Cleanup (การปิดงาน)**: When work on a task is finished and verified, **close the task by deleting that task's section from `TODO.md`** (เมื่อเสร็จงาน ให้ปิดงานโดยการลบแท็ก/ส่วนงานของงานนั้นออกจาก `TODO.md` เสมอ).
- **No Stale Task Retention**: Do not leave completed or historic task blocks accumulating in `TODO.md`. Delete `TODO.md` entirely if it only contained the completed task and has no other active or pre-existing tasks.
