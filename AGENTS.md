# SmartPOS Agent Guide

## Scope and authority

These instructions apply to SmartPOS, a retail management application. Do not
import unrelated KineGuide, LostLink, or Pinto business rules, frameworks, team
requirements, or release policies from reference projects or broader directory
guides. Report conflicts without editing parent guides. Higher-priority
instructions and actual execution permissions always apply.

- Respond in Thai unless another language is requested; preserve technical names.
- Inspect, explain, analyze, review-only, and show-flow requests are read-only.
- Inspect applicable instructions, actual stack, affected code, and Git diff
  before editing. Preserve unrelated tracked and untracked work.
- Implement only the requested scope; report unrelated defects without fixing them.
- Use one Main agent by default. Workers or Reviewers require explicit user
  authorization; a skill or role name does not authorize delegation.
- Do not change models, providers, agent configuration, execution rules, sandbox
  permissions, global skills, or global tool configuration unless explicitly requested.
- Do not commit, create branches, push, rewrite history, deploy, install dependencies,
  migrate, reset databases, or delete data without applicable scope and approval.
- Do not create/remove trackers or rule files as routine workflow support. Preserve
  the existing `TODO.md`; create a task tracker only when requested.

Project-wide guidance lives here; applicable nested instructions refine it.
`CLAUDE.md` describes Claude execution, not a second business policy. Skills provide
workflows; contracts, code, tests, and relevant documents provide evidence. If
they disagree, inspect implementation and dated evidence and report the discrepancy
rather than guessing or rewriting unrelated documentation.

## Architecture and ownership

```text
Browser / React -> public Go API -> PostgreSQL
                           |
                           +-> internal FastAPI AI service
```

- Go owns public HTTP behavior, authorization, tenant scoping, business orchestration,
  transactions, and primary PostgreSQL access.
- The browser calls the public API, not PostgreSQL or internal AI. Frontend
  permission checks are presentation, not authorization.
- Preserve the modular monolith and current module responsibilities. Extend real
  use cases; do not reorganize code into planned folders or add speculative services.
- Preserve storefront, account/onboarding, management, and staff boundaries. A
  visible route does not imply shopping capability or operational permissions.
- Preserve exact money/quantity representations, tenant boundaries, idempotency,
  atomic stock posting, immutable records, and audit behavior where touched.
  Read owning domain documents before changing business invariants.
- Distinguish implemented from planned behavior and historical acceptance. Resolve
  current schema/readiness from code and fresh evidence, not frozen versions here.

## Repository map

| Path                             | Responsibility                                                      |
| -------------------------------- | ------------------------------------------------------------------- |
| `apps/web/src/app`               | Router, providers, access, config, workspace navigation             |
| `apps/web/src/features`          | Feature UI and associated behavior/tests                            |
| `apps/web/src/layouts`           | Application/workspace shells                                        |
| `apps/web/src/components`        | Shared components and UI primitives                                 |
| `apps/web/src/lib`               | Existing API clients and helpers                                    |
| `apps/web/src/styles/tokens.css` | Canonical runtime visual tokens                                     |
| `apps/api/cmd/server`            | Go server entry point                                               |
| `apps/api/internal/transport`    | Public route composition                                            |
| `apps/api/internal/modules`      | Domain handlers, services, queries, tests                           |
| `apps/api/internal/platform`     | HTTP, configuration, database infrastructure                        |
| `apps/ai`                        | Internal AI service                                                 |
| `packages/contracts`             | OpenAPI and route inventory                                         |
| `database`                       | Migrations and SQL verification                                     |
| `tests`                          | Integration/browser verification                                    |
| `docs`                           | Architecture, business flows, database policy, development evidence |
| `infra`                          | Existing infrastructure configuration                               |

## Workflow and skill routing

1. Identify outcome, allowed writes, read-only references, and risks.
2. Inspect affected implementation, callers, contracts, tests, and user changes.
3. Select one primary skill; add specialists only for affected boundaries. Read
   selected canonical skills and relevant references, not every skill.
4. Define observable acceptance. Use a concise conversational plan for multi-step
   work; do not create workflow files automatically.
5. Make the smallest complete change. Add focused regression coverage for bugs
   and behavioral changes where existing test seams support it.
6. Run appropriate authorized checks, review the diff, and report actual results.

Skills live under `.agents/skills/<name>/SKILL.md`:

| Task                                         | Primary skill                    | Add when relevant                        |
| -------------------------------------------- | -------------------------------- | ---------------------------------------- |
| Orientation or unclear ownership             | `smartpos-project-context`       | Owning implementation skill              |
| React UI, navigation, forms, client state    | `smartpos-frontend`              | UI guidelines/verification, API contract |
| Styling, visual hierarchy, responsive layout | `smartpos-ui-guidelines`         | Frontend, UI verification                |
| Adaptive web, browser/device/input coverage  | `smartpos-cross-platform-design` | UI guidelines, frontend, UI verification |
| Appearance/browser interaction checks        | `smartpos-ui-verification`       | Owning skill for requested fixes         |
| Go handlers/services/business behavior       | `smartpos-go-backend`            | Database, contract, Go testing           |
| SQL, pgx, persistence, transactions          | `smartpos-go-database`           | Go backend/testing                       |
| Public route/request/response changes        | `smartpos-api-contract`          | Affected producer/consumer skills        |
| Go tests/backend verification                | `smartpos-go-testing`            | Owning skill for requested fixes         |
| Internal FastAPI AI and Go-to-AI integration | `smartpos-ai-service`            | Go backend, contract, AI evaluation      |
| Forecast backtesting and quality evaluation  | `smartpos-ai-evaluation`         | AI service for requested code changes    |

Do not load Go skills for visual-only work. Read-only tasks remain read-only even
when an implementation skill matches. Use AI evaluation only for forecast/model
quality, not health checks alone. For infrastructure work, inspect the actual
owning code and available guidance; do not force an unrelated skill. AI skills do
not authorize training, model/provider changes, production data access, or rollout.

## Safety and verification

- Never expose credentials, secrets, session/CSRF tokens, or private data. Do not
  print environment files or credential stores merely for context.
- Preserve backend authorization, organization/branch scope, and transaction
  context. Do not weaken checks or use another tenant's data as a fixture.
- Database/integration checks need a confirmed isolated target. Inspect scripts
  for service startup, migrations, and persistent fixture writes first. Never use
  the primary database or reset volumes as a verification shortcut.
- Never delete, skip, weaken, or bypass tests to obtain a pass.
- Discover commands from project scripts. Frontend gates include `npm run typecheck`,
  `npm run lint`, `npm run test`, and `npm run build`. `npm run contracts:check`
  checks contract inventory; `npm run e2e` needs the appropriate running environment.
- Documentation-only changes need metadata, references, formatting, and diff
  checks, not artificial application tests. Scope formatting to changed files;
  do not run repository-wide auto-fix for a small task.
- Builds are not browser evidence; unit tests are not database acceptance.
  Ordinary secure coding is required, but security-review and work-pattern-analysis
  require explicit authorization and are not automatic audits.
- Distinguish passed, failed, not run, and blocked. Historical reports are not
  checks performed in the current task. Report paths, results, and limitations.
