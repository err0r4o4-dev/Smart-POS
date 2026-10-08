# Five-developer workflow

`main`: stable releases; `develop`: integrated work. Feature/fix/docs branches from develop, small pull requests into develop, peer review, passing affected checks, release PR into main. This task does not create branches, commit, push or set remote protections automatically.

Suggested names: feature/catalog-barcode, fix/inventory-transfer-locking, docs/api-conventions. Conventional Commits, issue references when real issues exist; never invent issue IDs. PR description includes scope, contract/schema impact, tests/evidence and rollback considerations.

Ownership: frontend, Go identity/catalog, Go inventory/POS, purchasing/shelves, AI/DevOps/QA. Shared contracts require producer/consumer review. Do not modify another module's tables directly; use application ports. Never commit secrets/generated artifacts. Coordinate migrations to avoid version collisions; do not edit applied migrations. Never weaken tests or force-push protected history.
