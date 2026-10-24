# CLA-0005: Controllers stay thin; mapping is internal extension methods

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** architecture tests (controller location, DTO dependencies), reviewer

## Decision

- The API uses attribute-routed ASP.NET Core controllers. Controllers handle HTTP binding and status codes only; behaviour and business rules live in modules.
- Request and response DTOs live in the API project's `Contracts` folder and depend on neither MVC nor EF Core.
- Mapping at a boundary is written as internal extension methods in the consuming project. That covers DTOs to and from messages in the API, one module's messages to another's, and entities to and from messages in a persistence project (CLA-0003). There are no mapper interfaces and no mapping libraries.

## Consequences

- A business rule found in a controller during review moves into a module.
