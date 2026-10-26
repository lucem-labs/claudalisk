# CLA-0005: Modules may expose their own API, and controllers stay thin

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** architecture tests (DTO and controller dependencies), reviewer

## Context

The HTTP endpoints of a feature belong with the feature. If every endpoint lived in the Host, it would become a shared dumping ground that every feature must edit.

## Decision

- **Who owns controllers.** Endpoints use attribute-routed ASP.NET Core controllers.
  - A module can expose its own API. Its controllers live in its feature folders (CLA-0047), and module registration adds them (CLA-0004).
  - The Host (`<Root>.Api`) holds only endpoints with no business meaning, such as health, and registers app-wide concerns such as the Problem Details handler (CLA-0001, CLA-0063). Business logic that several modules need gets its own module.
- **Controllers stay thin.** They handle only HTTP binding and status codes. Behaviour and business rules live in the module's handlers and aggregates. Each feature has one small controller, which sends its command or query through the dispatcher (CLA-0047, CLA-0049).
- **DTOs.**
  - Request and response DTOs live next to the controller that uses them, in the feature's folder (CLA-0047).
  - They belong to the HTTP transport, so they can depend on ASP.NET Core MVC (for example binding attributes). They carry no validation attributes (CLA-0057).
  - They never depend on EF Core, and they are never messages (CLA-0003).
- Mapping between DTOs, messages, aggregates and entities follows CLA-0069.

## Consequences

- The API, messages and rules of a module change together, in one project.
- The controllers of a module reach its behaviour only by sending commands and queries through the dispatcher. They never call another module's internals (CLA-0002, CLA-0049).
- If a reviewer finds a business rule in a controller, it moves into the aggregate or the feature's handler.
