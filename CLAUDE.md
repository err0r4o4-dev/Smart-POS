# SmartPOS Claude Execution Guide

`AGENTS.md` remains the project guide for scope, architecture, ownership, safety,
and verification. This file describes Claude execution, not a second policy.
Higher-priority instructions and actual execution permissions always apply.

## Start and execute a task

1. Read the user request and applicable `AGENTS.md` instructions.
2. Classify read-only, implementation, or verification intent. Identify allowed
   writes and inspect Git status/diff before changing anything.
3. Select the smallest matching skill set using the routing table in `AGENTS.md`.
   Use project context when ownership is unclear, not as a full-history read for
   every small task.
4. Read selected `.agents/skills/<name>/SKILL.md` files and only relevant references.
5. Inspect existing equivalents, callers, and tests; define observable acceptance.
6. Implement only when requested, preserving user work and repository patterns.
7. Run appropriate authorized checks, inspect the final diff, and report actual
   results in Thai, separating failures, missing evidence, and environment blockers.

## Shared skills and discovery adapters

Canonical workflows live in `.agents/skills`. Corresponding
`.claude/skills/<name>/SKILL.md` adapters direct Claude to the canonical file. Do
not duplicate workflow bodies or define independent policy in adapters. Paths in
canonical skills are repository-root relative unless explicitly stated otherwise.

If automatic discovery is unavailable, use the canonical path explicitly. Do not
install tools or change configuration just to enable discovery. Project skills
must not depend on LostLink/Pinto folders, personal skills, or a particular MCP.

## Stop conditions and delivery

- Pause when a material unresolved contract, authorization, business-rule, or data
  target decision prevents safe progress; explain the specific decision.
- Read-only requests do not authorize fixes, fixture writes, or installation.
- Keep one Main agent unless delegation is explicitly authorized. Do not start
  harnesses, Workers, Reviewers, orchestrators, or audits automatically.
- Local completion is not production readiness or release authorization.
- Preserve unrelated changes and existing trackers. Report changed paths, checks
  actually run, limitations, and conflicts with project evidence.
