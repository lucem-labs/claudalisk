# CLA-0048: Aggregates live in a Domain project per module, and the stores map them

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** architecture tests (CLA-0006), reviewer

## Context

The aggregate decides which commands are allowed and which `_actions` a representation lists (CLA-0043, CLA-0044). Several features use the same aggregate, so its rules can't live in any one feature's handler, or they would be copied into each one. They also shouldn't live in EF Core entities, which would tie the rules to the database.

## Decision

- Each module has a `<Root>.Modules.<Name>.Domain` project holding its aggregates, entities and value objects as plain C#.
  - It references only `<Root>.Shared`. It never references EF Core, ASP.NET Core, the dispatcher, or any Interfaces project.
  - An aggregate enforces its own invariants. It exposes each command as a method, such as `order.Cancel(reason)`, and says which commands it allows right now, such as `order.CanCancel`. Those answers produce `_actions` (CLA-0044).
  - An aggregate carries its version, which becomes the `ETag` (CLA-0045).
- **The Persistence project maps the aggregates.**
  - The store contracts in `<Root>.Modules.<Name>.Persistence.Interfaces` load and save aggregates.
  - The stores in `<Root>.Modules.<Name>.Persistence` map EF Core entities to and from aggregates. EF Core entities never leave the Persistence project.
  - Read stores, used by query features, may return read models instead of aggregates (CLA-0047).
- A module's projects reference each other in one direction:

  | Project | References |
  |---|---|
  | `.Domain` | `<Root>.Shared` |
  | `.Persistence.Interfaces` | `.Domain` |
  | `.Persistence` | `.Persistence.Interfaces`, `.Domain`, `<Root>.Persistence` |
  | the implementation project | `.Domain`, `.Persistence.Interfaces`, its own `.Interfaces`, other modules' `.Interfaces` |

- Messages to other modules (CLA-0003) are mapped from aggregates in the implementation project. An aggregate is never a message.

## Consequences

- Domain rules are tested as plain C#, without a database or HTTP.
- Each aggregate has a mapping in its store. That is more code than mapping EF Core entities directly, in exchange for rules that don't depend on the database.
- A module has five projects: Interfaces, Domain, the implementation, Persistence.Interfaces and Persistence. The scaffold generates them together.
