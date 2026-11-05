# SmartPOS Repository Skills

This is a repository-local, Pinto-style foundation catalog, not a global installation or a verbatim copy of Pinto's policies. It adds 21 foundation skills while retaining all 11 existing smartpos-* skills unchanged.

## Loading and authority

- Select by the task and affected boundary. Read only selected SKILL.md files and their relevant references, not the entire catalog.
- Follow applicable delegation and independent review requirements. Imported examples and skills never grant authorization or tool permissions.
- Read-only requests remain read-only, including tracker/artifact creation and unsolicited fixes.
- Project-specific ownership and business invariants remain in AGENTS.md and the relevant smartpos-* guidance. Generic examples do not override them.
- Frontend guidance preserves Apple-inspired web/Cupertino-style adaptive mobile direction, SmartPOS yellow, canonical runtime tokens, local Thai/Latin fonts, Lucide and existing shared controls. It does not migrate the app to Next.js or change its design system.
- Existing global skills can be used when available but are neither modified nor duplicated here. No global configuration, provider, model or permission changes are part of this setup.

## Foundation catalog

| Area                 | Skills                                                                            | Scope                                                                                             |
| -------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Workflow             | tdd, diagnose, triage, handoff                                                    | Test-first implementation, evidence-based diagnosis, prioritization and requested status transfer |
| Frontend             | react-best-practices, web-design-guidelines, typescript-quality, frontend-testing | React client performance, accessibility/interaction, typed boundaries and component tests         |
| Go                   | golang-code-style, golang-error-handling, golang-context, golang-concurrency      | Idiomatic affected code, error identity, deadlines and bounded coordination                       |
| Database/testing     | golang-database, golang-testing                                                   | SQL/pgx patterns and observable Go/HTTP/integration behavior                                      |
| Operations/contracts | golang-observability, golang-performance, golang-swagger                          | Existing logs/metrics, measured optimization and manual OpenAPI maintenance                       |
| Python/AI            | python-fastapi, python-testing, ai-data-preparation, ai-evaluation                | Internal HTTP schemas, service tests, temporal preparation and authorized forecast evaluation     |

The 11 retained project skills cover orientation, frontend ownership, Apple UI, adaptive layouts, rendered verification, Go ownership, persistence, Go verification, public contracts, internal AI integration and retail forecast semantics. Use them when a task needs those constraints; do not load every foundation plus every project skill.

Global frontend-engineering, backend-engineering, api-contract-change, devops-engineering, testing-verification and visual-ui-verification are optional existing capabilities, not required dependencies. On a machine without them, use repository guidance and the actual owning code/scripts.

## Task flow

See the root [AGENTS.md](../../AGENTS.md) for project skill routing and tracker guidance.

## Sources and adaptations

[Source records](../skill-support/sources.json) distinguish local-authored entrypoints from adapted upstream workflows and preserved imported reference snapshots. They record source locations, Pinto lockfile hashes as provenance only, exact downloaded GitHub commits where known and source/installed content hashes.
Adaptation descriptions record the source and history of a skill; they do not set execution policy. Follow the applicable instructions and governing task for delegation, review and authorization, including when legacy metadata says "No automatic delegation".

This is intentionally not an installer-generated skills-lock.json: entrypoints were adapted for Codex and SmartPOS, so upstream installer hashes would falsely imply untouched packages. There is no background updater or installer command in this catalog.

- Go references and TDD examples were copied from the user-selected Pinto snapshot. Its upstream lock metadata identifies samber/cc-skills-golang and mattpocock/skills; that metadata is not proof of the exact Git commit of those local files.
- React references were fetched from a pinned vercel-labs/agent-skills commit. Only reviewed client-side examples were selected; Next.js/server-action/SWR instructions were not imported as runtime requirements.
- Workflow entrypoints were adapted for repository scope, applicable delegation and authorization, and preservation of tracker records.
- golang-swagger uses manual contract editing, not swag generation or annotation scaffolding. Python/AI and the remaining frontend entrypoints are locally authored, not advertised as community packages.
- Imported references are examples, not execution authority. Installation, destructive fixtures, logger migrations, production instructions and external skill mentions in them require their own explicit scope; existing repository policy wins.
- [Samber MIT notice](../skill-support/licenses/samber-MIT.txt), [Matt Pocock MIT notice](../skill-support/licenses/mattpocock-MIT.txt), and [Vercel declaration/terms](../skill-support/licenses/vercel-react-MIT.md) preserve available source licensing information.

## Verification and evaluation

Run from the repository root with the existing Node/YAML environment; these commands do not install dependencies or start services:

```powershell
node --test .agents/skill-support/validate.test.mjs
node .agents/skill-support/validate.mjs
```

The validator checks YAML manifests, local names, relative Markdown references, source records and imported snapshot hashes. Its tests use disposable temporary fixtures. These checks are not a full Markdown parser, browser tests, database acceptance or proof of model routing.

[Behavioral scenarios](../skill-support/evals/scenarios.json) are an offline forward-evaluation plan, not measured results. Running them through another model or agent, or writing artifacts, follows the governing task and applicable execution permissions; the validator does not run them automatically.

Use the skill selector to inspect available names in a fresh session if the current session's initial list has not refreshed. File/metadata checks do not prove that a running host has reloaded its skill list.
