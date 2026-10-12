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
- For requested implementation, maintain a task checklist in root `TODO.md` using
  the lifecycle below. Preserve the existing roadmap and unrelated task sections.
  Read-only requests do not create or update trackers. Do not create other rule
  or tracker files as routine workflow support.

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
3. Select skills by the requested behavior and actual affected boundaries. Use one
   primary skill and add specialists only when needed; do not load the whole library
   or impose a fixed skill count on cross-domain work.
4. Define observable acceptance and maintain the implementation checklist below.
   Ask only about material ambiguity that inspection cannot resolve.
5. For behavior changes, work in test-first vertical slices: one relevant failing
   test, minimum implementation, then refactor with tests passing. Use existing
   test seams; documentation-only work uses document checks rather than app tests.
6. Run appropriate authorized checks, review the diff, report actual results, and
   clean up only the completed task's checklist.

### TODO lifecycle

- Before implementation edits, create a task section in the existing root
  `TODO.md`. If the file does not exist, create a task-only file. Include inspection,
  acceptance/test design, tests or appropriate document/config checks,
  implementation, verification, and cleanup.
- Work from the first unchecked item in the current task section. Mark `[x]`
  only after that item actually completes; never mark blocked or failed checks done.
- Record failed commands, blockers, and checks not run beneath their relevant
  unchecked items. Keep the section when required work remains incomplete.
- After acceptance and verification succeed, remove only the section created for
  that task if it has no unrelated user additions. Never delete the tracked roadmap,
  another task section, or tests. Delete a task-only file only if this task created
  it, it contains no user additions, and deletion is authorized.
- Read-only explanations, inspections, reviews, and show-flow requests do not
  create checklists or authorize implementation, tests with side effects, or fixes.
- This project-local workflow does not change global guidance, execution policy,
  models, providers, tool permissions, or the requirement for approval where needed.

### Foundation skills and selective loading

Repository skills live under `.agents/skills/<name>/SKILL.md`. Their descriptions
identify when they apply; read the full entrypoint only when selected, and read
linked references only for the relevant mode. Skills are instructions, not services
that run in the background. Their scripts and example commands are not auto-run.
They never authorize dependency installation, production access, delegation,
commits, migrations, or deployment.

The foundation catalog and source/adaptation records are in
`.agents/skills/README.md` and `.agents/skill-support/sources.json`. Existing
`smartpos-*` skills remain available as project-specific guidance. Do not load
every foundation and project skill together merely because both exist.

| Task                                                       | Primary skill                    | Add only for an affected concern                                   |
| ---------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| Orientation or unclear ownership                           | `smartpos-project-context`       | Owning area after tracing the flow                                 |
| React pages, forms, API clients, navigation                | `smartpos-frontend`              | `react-best-practices`, `typescript-quality`, `frontend-testing`   |
| UI accessibility, forms, keyboard and interaction review   | `web-design-guidelines`          | `smartpos-ui-guidelines` for requested visual changes              |
| Styling and Apple-inspired visual hierarchy                | `smartpos-ui-guidelines`         | `smartpos-frontend`, `web-design-guidelines`                       |
| Adaptive browser/device/input behavior                     | `smartpos-cross-platform-design` | `smartpos-ui-verification` for rendered evidence                   |
| Component and interaction tests                            | `frontend-testing`               | `smartpos-ui-verification` for browser appearance/interactions     |
| Go handlers/services/business behavior                     | `smartpos-go-backend`            | Specific Go foundation skills listed below                         |
| SQL, pgx and transactions                                  | `golang-database`                | `smartpos-go-database` for tenant, retail and migration invariants |
| Go tests and HTTP behavior checks                          | `golang-testing`                 | `smartpos-go-testing` for project checks and isolated integration  |
| Error classification/wrapping                              | `golang-error-handling`          | Owning backend/API contract skill                                  |
| Deadlines, cancellation and request lifecycle              | `golang-context`                 | `golang-concurrency` only when concurrent work is affected         |
| Idiomatic Go and formatting                                | `golang-code-style`              | Owning skill; no unsolicited package reorganization                |
| Go logs and metrics                                        | `golang-observability`           | Owning service skill; no automatic monitoring deployment           |
| Measured Go performance work                               | `golang-performance`             | `golang-concurrency` or `golang-database` for the bottleneck       |
| Public HTTP contract changes                               | `smartpos-api-contract`          | `golang-swagger` for manual OpenAPI edits and affected consumers   |
| FastAPI schemas and internal endpoints                     | `python-fastapi`                 | `smartpos-ai-service` for Go-to-AI ownership/integration           |
| Python service tests                                       | `python-testing`                 | Owning AI/service skill                                            |
| Forecast data preparation                                  | `ai-data-preparation`            | `smartpos-ai-evaluation` for retail units, cutoff and tenant scope |
| Forecast backtesting/quality                               | `ai-evaluation`                  | `smartpos-ai-evaluation`, `python-testing` when relevant           |
| Behavior-changing implementation requiring test-first work | `tdd`                            | Owning implementation/testing skill                                |
| Reproducible bugs and regressions                          | `diagnose`                       | Owning area after diagnosis                                        |
| Multiple reports and scope/priorities                      | `triage`                         | `diagnose` for an issue being investigated                         |
| Explicit status or context transfer                        | `handoff`                        | Actual task evidence; not automatic document creation              |

For Docker/CI/environment work, use the existing global `devops-engineering` skill
if available; otherwise inspect the owning configuration and scripts directly.
Existing global `frontend-engineering`, `backend-engineering`,
`api-contract-change`, `testing-verification`, and `visual-ui-verification` remain
optional and unchanged. Do not install duplicate local copies or require a global
skill to be present for this repository to work. Preserve project ownership and
scope when applying generic guidance.

### UI and AI boundaries

- All frontend guidance stays within SmartPOS's Apple-inspired web identity and
  Cupertino-style adaptive mobile direction. Runtime tokens in
  `apps/web/src/styles/tokens.css`, SmartPOS yellow, local Thai/Latin fonts, Lucide,
  existing shared controls, and efficient POS density remain authoritative.
- Generic or community examples do not authorize changing the theme, adding a
  component library, switching to Next.js/React Native, introducing SWR, or using
  Apple fonts/icons instead of the established stack. Use `smartpos-ui-guidelines`
  when visual decisions are needed; no unsolicited redesign.
- Do not load Go skills for visual-only work or AI evaluation for health-only
  checks. AI skills do not authorize training, model/provider changes, paid
  inference, production data access, or autonomous retail actions.

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
