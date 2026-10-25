# CLA-0005: Modules may expose their own API; controllers stay thin; mapping is internal extension methods

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** architecture tests (DTO and controller dependencies), reviewer

## Context

The HTTP endpoints of a feature belong with the feature. One existing app let modules expose their own controllers, which module registration picks up (CLA-0004). This stops the API project from becoming a shared dumping ground that every feature must edit.

## Decision

- **Who owns controllers.** Endpoints use attribute-routed ASP.NET Core controllers.
  - A module can expose and register its own API. Its controllers live in its implementation project, and module registration adds them.
  - The API project holds only cross-cutting endpoints and concerns, such as health and exception filters.
- **Controllers stay thin.** They handle only HTTP binding and status codes. Behaviour and business rules live in the module's handlers and aggregates. Proposed: one small controller per feature, which sends its request through the dispatcher (CLA-0047, CLA-0049).
- **DTOs.**
  - Request and response DTOs live next to the controller that uses them: in the `Dtos` folder of the API project for cross-cutting endpoints, and in the feature's folder in a module (CLA-0047, proposed).
  - They belong to the HTTP transport, so they can depend on ASP.NET Core MVC (for example binding and validation attributes).
  - They never depend on EF Core, and they are never messages (CLA-0003).
- **Mapping** at a boundary is internal extension methods in the consuming project. This covers:
  - DTOs to and from messages or a feature's requests, next to the controller;
  - the messages of one module to those of another;
  - EF Core entities to and from aggregates or messages, in a persistence project (CLA-0048, proposed).

  Do not use mapper interfaces or mapping libraries.

## Consequences

- The API, messages and rules of a module change together, in one project.
- The controllers of a module reach its behaviour only through the module's code. They never call another module's internals (CLA-0002). Under the proposed CLA-0049 they only send commands and queries through the dispatcher.
- If a reviewer finds a business rule in a controller, it moves into the aggregate or the feature's handler.
