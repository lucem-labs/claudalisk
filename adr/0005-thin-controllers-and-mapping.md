# CLA-0005: Modules may expose their own API; controllers stay thin; mapping is internal extension methods

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** architecture tests (DTO and controller dependencies), reviewer

## Context

A feature's HTTP endpoints belong with the feature. One existing app let modules expose their own controllers, which module registration picks up (CLA-0004). That keeps the API project from becoming a shared dumping ground that every feature has to edit.

## Decision

- **Who owns controllers.** Endpoints use attribute-routed ASP.NET Core controllers.
  - A module may expose and register its own API: its controllers live in its implementation project and are added by module registration.
  - The API project holds only cross-cutting endpoints and concerns, such as health and exception filters.
- **Controllers stay thin.** They handle HTTP binding and status codes only. Behaviour and business rules live in the module's services.
- **DTOs.**
  - Request and response DTOs live in a `Dtos` folder of the project that owns the controller.
  - They are tied to the HTTP transport, so they may depend on ASP.NET Core MVC (binding and validation attributes, for example).
  - They never depend on EF Core, and they are never messages (CLA-0003).
- **Mapping** at a boundary is written as internal extension methods in the consuming project. That covers:
  - DTOs to and from messages, next to the controller;
  - one module's messages to another's;
  - entities to and from messages, in a persistence project.

  There are no mapper interfaces and no mapping libraries.

## Consequences

- A module's API, messages and rules change together, in one project.
- A module's controllers call its services through the module's own contracts or internal services. They never call another module's internals (CLA-0002).
- A business rule found in a controller during review moves into a service.
