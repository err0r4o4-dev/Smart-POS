---
name: diagnose
description: 'Investigate reproducible bugs, crashes, regressions or failing tests. Use evidence before fixes; read-only diagnosis stays read-only.'
license: MIT
metadata:
  origin: adapted-from-pinto
  upstream: mattpocock/skills
---

# Diagnose

Establish the requested outcome: explanation only or an authorized fix. Do not start services, export data, create issues or edit files just to investigate an explanation request.

1. Capture the expected versus actual behavior and the smallest known reproduction.
2. Inspect the affected code, inputs, environment prerequisites and recent relevant diff/history without reading secrets.
3. Form a specific hypothesis and choose the least invasive observation that could disprove it.
4. Reproduce locally or in a confirmed isolated target using existing tools. Distinguish code failures from missing prerequisites.
5. For an authorized fix, add a focused regression test and repair the root cause with the smallest change.
6. Re-run the targeted check and verify affected boundaries; report unrelated findings without fixing them.

Work with one Main agent unless the user explicitly authorizes delegation. Do not add logging infrastructure, install debugging tools or alter production as an automatic diagnosis step. State uncertainty and blockers instead of guessing a root cause.
