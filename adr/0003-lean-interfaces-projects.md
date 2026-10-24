# CLA-0003: Interfaces projects are lean, and pass messages that are POCOs

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** architecture tests

## Context

Calling the objects passed through an interface "models" quickly gets muddled with database models (EF Core entities). Once the two are confused, persistence types and behaviour leak across module boundaries. A distinct name keeps the separation visible in code and in conversation.

## Decision

- **Name.** The objects an interface takes and returns are **messages**: requests in, results out. Messages are not models.
- **Messages are POCOs.** Plain data, with properties and an optional constructor, preferably immutable records. No business logic, no behaviour, and no references to EF Core, MVC or service types.
- **Messages belong to one Interfaces project.**
  - A message is never reused by another Interfaces project, neither by reference nor through a shared "common" contracts project.
  - When two modules need similar data, each defines its own message, and the consuming side maps between them (CLA-0005).
  - Within one Interfaces project, its interfaces may share a message.
- **No other dependencies.** Interfaces projects don't reference other Interfaces projects, EF Core or ASP.NET Core MVC.
- **Layout.** One interface per file. A message used by only one interface lives next to it.
- **Persistence.** Persistence is reached through store contracts in a `*.Persistence.Interfaces` project, either the shared one or the module's own (CLA-0007). Modules never see EF Core types: a store maps entities to messages inside the persistence project.
- **Messages are not HTTP DTOs.** The API's request and response DTOs (CLA-0005) are separate types. Controllers map between DTOs and messages.

## Consequences

- Contracts stay cheap to reference, free of infrastructure, and usable over any transport (CLA-0001).
- The same concept may exist as an entity, a message in each module that needs it, and a DTO. The duplication is deliberate: each layer can change without breaking the others.
- Architecture tests check that:
  - types in Interfaces projects are interfaces or messages;
  - messages have no methods beyond those the compiler generates for records;
  - no message type appears in more than one Interfaces assembly's public surface.
