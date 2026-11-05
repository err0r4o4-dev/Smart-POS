# SmartPOS Claude Execution Guide

Use the project `AGENTS.md` for SmartPOS guidance and skill routing. This file
describes Claude discovery and adapters.

## Shared skills and discovery adapters

Canonical workflows live in `.agents/skills`. Corresponding
`.claude/skills/<name>/SKILL.md` adapters direct Claude to the canonical file. Do
not duplicate workflow bodies or define independent policy in adapters. Paths in
canonical skills are repository-root relative unless explicitly stated otherwise.

If automatic discovery is unavailable, use the canonical path explicitly. Do not
install tools or change configuration just to enable discovery. Project skills
must not depend on LostLink/Pinto folders, personal skills, or a particular MCP.
