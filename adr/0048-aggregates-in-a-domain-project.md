# CLA-0048: Aggregates live in a Domain project per module, and the stores map them

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** architecture tests (CLA-0006), reviewer

## Context

The aggregate decides which commands are allowed and which `_actions` a representation lists (CLA-0043, CLA-0044). Several features use the same aggregate, so its rules cannot live in the handler of one feature. Each feature would get a copy. The rules must not live in EF Core entities either, because that ties them to the database.

## Decision

- Each module has a `<Root>.Modules.<Name>.Domain` project. It holds the aggregates, entities and value objects as plain C#.
  - It references only `<Root>.Shared`. It never references EF Core, ASP.NET Core, the dispatcher, or any Interfaces project.
  - An aggregate enforces its own invariants. It exposes each command as a method, such as `order.Cancel(reason)`. It also says which commands it allows now, such as `order.CanCancel`. Those answers produce `_actions` (CLA-0044).
  - An aggregate carries its version, which becomes the `ETag` (CLA-0045).
- **The Persistence project maps the aggregates.**
  - The store contracts in `<Root>.Modules.<Name>.Persistence.Interfaces` load and save aggregates.
  - The stores in `<Root>.Modules.<Name>.Persistence` map EF Core entities to and from aggregates. EF Core entities never leave the Persistence project.
  - Read stores, which query features use, can return read models instead of aggregates (CLA-0047).
- The projects of a module reference each other in one direction:

  | Project | References |
  |---|---|
  | `.Domain` | `<Root>.Shared` |
  | `.Persistence.Interfaces` | `.Domain` |
  | `.Persistence` | `.Persistence.Interfaces`, `.Domain`, `<Root>.Persistence` |
  | the implementation project | `.Domain`, `.Persistence.Interfaces`, its own `.Interfaces`, other modules' `.Interfaces` |

- The implementation project maps aggregates to the messages for other modules (CLA-0003). An aggregate is never a message.

## Consequences

- Tests check domain rules as plain C#, without a database or HTTP.
- Each aggregate has a mapping in its store. This is more code than a direct mapping of EF Core entities. In exchange, the rules do not depend on the database.
- A module has five projects: Interfaces, Domain, the implementation, Persistence.Interfaces and Persistence. The scaffold generates them together.
