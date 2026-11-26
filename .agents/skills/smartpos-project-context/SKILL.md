---
name: smartpos-project-context
description: Orient SmartPOS work by locating actual module ownership, workspaces, contracts, and verification evidence. Use for project-flow explanations, cross-domain scoping, or unclear ownership; do not load the full project history for small localized tasks.
---

# SmartPOS Project Context

## Scope

Read `AGENTS.md` and the current task. This skill provides orientation, not
permission to implement, audit, delegate, or run services. All paths below are
repository-root relative.

## Workflow

1. Identify the requested journey and whether the task is read-only or a change.
2. Inspect the relevant Git diff and implementation before choosing ownership.
3. Trace only the affected UI route, API handler/service, and persistence boundary.
4. Read corresponding documents/tests, distinguishing implemented behavior,
   planned architecture, and historical verification.
5. Select the owning skill and relevant specialists; do not read all domain docs.

## Reference map

| Question                           | Starting references                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Product/service boundaries         | `README.md`, `docs/architecture/overview.md`                                                             |
| Workspaces and permissions         | `docs/architecture/workspaces.md`, `docs/architecture/organization.md`, `apps/web/src/app`               |
| Public contract and routes         | `packages/contracts/openapi.yaml`, `packages/contracts/routes.json`, `apps/api/internal/transport`       |
| POS settlement                     | `docs/architecture/pos.md`, `docs/business-flows/pos-checkout.md`, `docs/database/sales-transactions.md` |
| Stock ledger                       | `docs/architecture/inventory.md`, `docs/database/inventory-ledger.md`                                    |
| Returns, purchasing, other domains | Owning files in `docs/architecture`, `docs/business-flows`, `apps/api/internal/modules`                  |
| Security boundaries                | `docs/security/security-model.md` and affected implementation                                            |
| Verification prerequisites         | `docs/development/verification.md`, relevant dated reports, `package.json`, affected test scripts        |

## Rules and output

- Preserve Go public API, React frontend, PostgreSQL ownership, and internal AI
  boundaries. Do not import reference projects' frameworks or business rules.
- Planned routes/folders and historical schema references are not active behavior.
  Inspect current code, contracts, tests, and relevant migrations.
- If documents disagree, report the exact discrepancy and establish the affected
  behavior from actual evidence. Ask when a product decision remains unresolved;
  do not silently repair unrelated docs or invent a business rule.
- Do not load environment files, credentials, or complete logs for orientation.
- Keep references project-local; no LostLink/Pinto path is required by these skills.
- Output a concise boundary map, relevant paths, selected skills, acceptance
  criteria, and open questions. Read-only explanations stop without changes or
  mutating checks.
