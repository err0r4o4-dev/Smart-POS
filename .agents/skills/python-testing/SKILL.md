---
name: python-testing
description: 'Design Python/FastAPI tests with existing pytest/httpx seams and deterministic fixtures. Use for service tests, not automatic model-quality claims.'
metadata:
  origin: local-authored
---

# Python Service Testing

Inspect existing tests, fixtures, dependency groups and commands. Use pytest and the established HTTP client/test harness; do not install packages merely for verification.

- For a service bug, reproduce the intended failure first. Cover validation, denied/internal authentication, error mapping and success schemas where relevant.
- Test finite values, unsupported versions, malformed payloads, insufficient data and dependency failures when those states are part of the contract.
- Stub external HTTP or inference boundaries deterministically. Never require paid providers, live secrets or production data for unit tests.
- Separate async/lifespan behavior from simple synchronous client checks using the project's established fixtures.
- Keep clocks, datasets and seeds reproducible where randomness or time matters. Do not weaken assertions to tolerate a broken schema.

Read the [test matrix](references/test-matrix.md) for affected cases. In SmartPOS preserve the Go-to-AI contract and use isolated data. Passing service tests proves boundary behavior, not forecast accuracy; use ai-evaluation for an authorized quality evaluation.

Report actual commands, prerequisites and pass/fail/block/not-run status without claiming a training or evaluation run that did not happen.
