# Dependencies and team ownership

Transport -> application -> domain; infrastructure -> domain interfaces. Composition root wires adapters. Domain never imports HTTP/SQL/UI/AI packages.

| Frontend       | Go domains                            | Upstream capabilities                       |
| -------------- | ------------------------------------- | ------------------------------------------- |
| Authentication | identity, organization                | none                                        |
| Dashboard      | reporting, notifications              | read models                                 |
| POS            | sales, payments, registers            | identity, catalog, pricing, inventory ports |
| Sales          | sales, receipts                       | identity, immutable sale snapshots          |
| Products       | catalog                               | organization                                |
| Inventory      | inventory                             | catalog identifiers, organization           |
| Shelves        | shelves                               | inventory transfer port                     |
| Purchasing     | purchasing, suppliers                 | catalog, inventory receive port             |
| Pricing        | pricing, promotions                   | catalog, approvals                          |
| Customers      | customers, loyalty                    | organization, sale events                   |
| Quality        | quality                               | inventory write-off port                    |
| AI             | intelligence                          | reporting snapshots, AI client              |
| Reports        | reporting                             | domain events/read models                   |
| Employees      | employees, identity, approvals, audit | organization                                |
| Settings       | organization, settings                | identity                                    |
| Help           | platform                              | none                                        |

Inventory never calls sales/purchasing. Orchestrators use inventory ports and one shared transaction, never nested commits. AI proposes; purchasing explicitly accepts. Audit/notifications consume durable events without backwards dependencies.

Developer A: web/tokens/accessibility. B: identity/catalog/organization. C: inventory/POS/sales. D: purchasing/shelves/quality. E: AI/infrastructure/QA. Suggested ownership is not permission to overwrite others. Contract changes require producer/consumer review.
