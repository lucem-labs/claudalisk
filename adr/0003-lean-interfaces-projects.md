# CLA-0003: Interfaces projects are lean, and pass messages that are POCOs

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** architecture tests

## Context

If the objects passed through an interface are called "models", people confuse them with database models (EF Core entities). Then persistence types and behaviour leak across module boundaries. A distinct name keeps the separation visible in code and in conversation.

## Decision

- **Name.** The objects an interface takes and returns are **messages**: commands and queries in, results out. Messages are not models. "Request" means only an HTTP request DTO (CLA-0005).
- **Messages are POCOs.** They are plain data, with properties and an optional constructor, preferably immutable records. They have no business logic, no behaviour, and no references to EF Core, MVC or service types.
- **Messages belong to one Interfaces project.**
  - Another Interfaces project never reuses a message, by reference or through a shared "common" contracts project.
  - When two modules need similar data, each defines its own message, and the consuming side maps between them (CLA-0005).
  - Inside one Interfaces project, its interfaces can share a message.
- **No other dependencies.** Interfaces projects do not reference other Interfaces projects, EF Core or ASP.NET Core MVC. The one planned exception is the dispatcher's abstractions package, so that modules can send commands and queries to each other (proposed in CLA-0049 and CLA-0062).
- **Layout.** Use one interface per file. A message that only one interface uses lives next to it.
- **Persistence.** A module reaches its data through store contracts in its own `<Root>.Modules.<Name>.Persistence.Interfaces` project (CLA-0007). Modules never see EF Core types. A store maps entities to messages inside the persistence project, or to aggregates under the proposed CLA-0048.
- **Messages are not HTTP DTOs.** The request and response DTOs of a controller (CLA-0005) are separate types. Controllers map between DTOs and messages.

## Consequences

- Contracts are cheap to reference, free of infrastructure, and usable over any transport (CLA-0001).
- The same concept can exist as an entity, as a message in each module that needs it, and as a DTO. The duplication is deliberate: each layer can change without breaking the others.
- Architecture tests check that:
  - types in Interfaces projects are interfaces or messages;
  - messages have no methods beyond those the compiler generates for records;
  - no message type appears in the public surface of more than one Interfaces assembly.
