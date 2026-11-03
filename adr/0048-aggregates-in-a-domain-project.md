# CLA-0048: Aggregates live in a Domain project per module, and the stores map them

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** architecture tests (Domain projects reference only `<Root>.Shared` and `Claudalisk.Domain`), reviewer

## Context

The aggregate decides which commands are allowed and which `_actions` a representation lists (CLA-0043, CLA-0044). Several features use the same aggregate, so its rules cannot live in the handler of one feature. Each feature would get a copy. The rules must not live in EF Core entities either, because that ties them to the database.

## Decision

- Each module has a `<Root>.Modules.<Name>.Domain` project. It holds the aggregates, entities and value objects as plain C#.
  - It references only `<Root>.Shared` and the `Claudalisk.Domain` package. It never references EF Core, ASP.NET Core, the dispatcher, or any Interfaces project.
  - An aggregate enforces its own invariants, and refuses a command by throwing a `DomainException` (CLA-0063). It exposes each command as a method, such as `order.Cancel(reason)`. It also says which commands it allows now, such as `order.CanCancel`. Those answers produce `_actions` (CLA-0044).
  - That answer may be a pure function of the aggregate's state, in the Domain project, such as `OrderRules.CanCancel(status)`. The aggregate's methods call it, and so does the mapping of a read model's `_actions`, so the two cannot disagree.
  - An aggregate carries its version, which becomes the `ETag` (CLA-0045, CLA-0056).
- **The Persistence project maps the aggregates.**
  - The store contracts in `<Root>.Modules.<Name>.Persistence.Interfaces` load and save aggregates.
  - The stores in `<Root>.Modules.<Name>.Persistence` map EF Core entities to and from aggregates. EF Core entities never leave the Persistence project.
  - Read stores return read models, and serve only read-model resources (CLA-0042, CLA-0047). A `GET` of an aggregate loads the aggregate. A collection page loads the aggregates, or reads through a read store when its `_actions` come from such a pure function and each row holds the version and everything the function needs (CLA-0047).
- The projects of a module reference each other in one direction:

  | Project | References |
  |---|---|
  | `.Domain` | `<Root>.Shared`, `Claudalisk.Domain` (CLA-0062) |
  | `.Persistence.Interfaces` | `.Domain` |
  | `.Persistence` | `.Persistence.Interfaces`, `.Domain`, the claudalisk persistence package (CLA-0007) |
  | the implementation project | `.Domain`, `.Persistence.Interfaces`, its own `.Interfaces`, other modules' `.Interfaces` |

- The implementation project maps aggregates to the messages for other modules (CLA-0003). An aggregate is never a message.

## Consequences

- Tests check domain rules as plain C#, without a database or HTTP.
- Each aggregate has a mapping in its store. This is more code than a direct mapping of EF Core entities. In exchange, the rules do not depend on the database.
- A module has five projects: Interfaces, Domain, the implementation, Persistence.Interfaces and Persistence. The scaffold generates them together.
