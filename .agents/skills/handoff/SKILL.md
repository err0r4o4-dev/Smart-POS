---
name: handoff
description: 'Summarize task status and verified context for a requested handoff. Use real evidence; do not automatically write files or post externally.'
license: MIT
metadata:
  origin: adapted-from-pinto
  upstream: mattpocock/skills
---

# Handoff

Read the current task, relevant diff and recorded checks. Do not scan unrelated histories or private data.

Include the requested outcome, changed paths and behavior, decisions/constraints, checks actually performed, remaining blockers and the next concrete step. Distinguish implemented from planned and passed from failed, blocked or not run.

Preserve scope, Apple-inspired UI requirements, tenant/data invariants and deployment limitations when relevant. Do not claim production readiness from local tests or repeat secrets in examples.

Return the handoff in Thai in chat unless another language or artifact was requested. Do not create a document, issue, commit, branch or external message automatically. Keep pending TODO items available and preserve the roadmap.
