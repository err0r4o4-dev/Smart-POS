---
name: smartpos-go-testing
description: Plan or perform focused SmartPOS Go domain/HTTP tests and backend verification with existing Go tests, httptest, integration scripts, and isolated database checks. Use for backend changes or test tasks; do not install tools, start a migrating stack, weaken tests, or reuse historical evidence as a current pass.
---

# SmartPOS Go Testing

## Preconditions

Read `AGENTS.md`, requested behavior/diff, nearby Go tests, relevant scripts, and
`docs/development/verification.md`. All paths are repository-root relative.
Existing references include `apps/api/internal/transport/router_test.go`, module
tests in `apps/api/internal/modules`, `tests/integration`, `package.json`,
`docker-compose.yml`, and the relevant dated development report.

Historical reports explain earlier runs. Inspect actual scripts/images/targets
and tool availability before execution; recorded passes or blockers are not the
current task's result. Verification-only work does not authorize fixes.

## Workflow

1. Define observable acceptance and the narrow existing test seam. Add a reproducing
   regression test for a bug when practical.
2. Cover relevant success, invalid input, foreign-tenant/denied access, not-found,
   conflict, and failure cases. Add retry/idempotency, decimal, rollback,
   stale-version, and concurrency cases only for touched invariants.
3. Reuse Go test/`httptest` patterns. Do not mock away the transaction or
   authorization boundary that the test is intended to prove.
4. Start with focused package/tests, then expand to affected modules/API. Reuse
   existing integration scripts rather than creating a second test framework.
5. Confirm prerequisites for race, DB, and browser checks. Do not install compilers,
   change global environment, or start services merely to hide an environment blocker.
6. Inspect final diff for unintended scope, weakened tests, or fixture changes.

## Check selection

| Check                                   | Conditions and limits                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `go test ./internal/<affected-package>` | From `apps/api`, replace placeholder with actual package and inspect test side effects      |
| `go test ./...`                         | Broader Go coverage when justified and prerequisites are available                          |
| `go vet ./...`, `go build ./...`        | From `apps/api` when relevant; neither proves DB/browser behavior                           |
| `go test -race ./...`                   | Requires race-capable toolchain/CGO; use an existing approved environment or report blocked |
| `gofmt -l <changed-go-files>`           | Read-only formatting check; limit formatting writes to requested files                      |
| Existing `npm run verify:*` scripts     | Inspect script/image, target variables, migrations, and fixture writes first                |

Database checks require a confirmed isolated target. Scripts may create retained
scratch databases or persistent HTTP fixtures. Do not assume default URLs/project
names are safe, hardcode old targets, use primary volumes, or reset data. Migration,
stack startup, and cleanup remain scoped actions requiring applicable approvals.
Even unit commands can populate tool caches; respect execution permissions and
report unavailable prerequisites instead of silently changing configuration.

## Output

Report actual commands, directories, target confirmation without secrets, and
passed/failed/not-run/blocked results. Separate regressions, unrelated failures,
and environment limitations. Never weaken/bypass tests, claim a security audit,
or turn verification-only work into an unrequested fix.
