# CLA-0049: Every feature sends its commands and queries through the dispatcher

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** architecture tests (controllers depend only on the dispatcher and their feature's types), reviewer
- **Issue:** #34

## Context

Claudalisk builds its own in-process dispatcher, a mediator-style package (CLA-0007). If every feature goes through it from the start, every use case has one pipeline for the unit of work, validation and logging. A feature's own commands and queries and those of another module then use the same pattern.

## Decision

- Each feature defines one command or query for each operation. Each has exactly one handler in the same feature folder. "Request" means only the HTTP request DTO.
- **Controllers send, never call.** A controller binds the HTTP request and maps it to the feature's command or query. It sends that through the dispatcher and maps the result to a response. It never calls a handler, a store or a service directly.
- **Handlers do the work.** A command handler loads the aggregate through its store, calls the aggregate's command method, and saves it. A query handler reads through a read store.
- **Pipeline steps wrap every command and query in the same order:**
  1. logging
  2. validation, which runs the FluentValidation validators and turns invalid input into `400` Problem Details (CLA-0045, CLA-0057)
  3. the unit of work, for commands (CLA-0007)

  Queries run without a unit of work.
- **Calls between modules use the same dispatcher.** They use commands and queries that the Interfaces project of the target module declares (CLA-0002, CLA-0003). A handler never sends a command or query to another feature of its own module (CLA-0050).
- The dispatcher follows the rules in CLA-0007: same DI scope, scoped or transient handlers, notifications one at a time, and exceptions that propagate.

## Consequences

- Every use case has the same shape, so a reader or an agent knows where each piece goes.
- Cross-cutting behaviour is added once, as a pipeline step, not in each controller.
- The dispatcher is in use from the first feature. It must exist before a new app is scaffolded, so the team must build it before this ADR is accepted.
