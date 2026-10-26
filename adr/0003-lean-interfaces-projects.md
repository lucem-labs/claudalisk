# CLA-0003: Interfaces projects are lean, and pass messages that are POCOs

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** architecture tests

## Context

If the objects passed through an interface are called "models", people confuse them with database models (EF Core entities). Then persistence types and behaviour leak across module boundaries. A distinct name keeps the separation visible in code and in conversation.

## Decision

- **Name.** The types that modules exchange are **messages**: commands and queries in, results out. Messages are not models. "Request" means only an HTTP request DTO (CLA-0005).
- **Messages are POCOs.** They are plain data, with properties and an optional constructor, preferably immutable records. They have no business logic, no behaviour, and no references to EF Core, MVC or service types. They implement no interface and have no base type.
- **Messages belong to one Interfaces project.**
  - Another Interfaces project never reuses a message, by reference or through a shared "common" contracts project.
  - When two modules need similar data, each defines its own message, and the consuming side maps between them (CLA-0005).
  - Inside one Interfaces project, its operations can share a message.
- **No dependencies.** An Interfaces project references no project and no package, not even the dispatcher's.
- **The handler declares the result.** A message does not say what it returns. Its one handler, in the owning module's implementation project, implements `IHandler<TMessage, TResult>` from the dispatcher package. A caller names the result type when it sends: `dispatcher.SendAsync<OrderSummaryResult>(new GetOrderSummaryQuery(orderId))`. A command is a message whose name ends in `Command`, and a query one whose name ends in `Query` (CLA-0052).
- **The dispatcher checks the pairing.** At startup it fails when a message type in an Interfaces project has no handler or more than one. A send whose result type does not match the handler's fails with an error that names both types.
- **Layout.** Use one message per file. An Interfaces project holds only messages and the module marker, an empty class (CLA-0004), with no service interfaces (CLA-0067).
- **Persistence.** A module reaches its data through store contracts in its own `<Root>.Modules.<Name>.Persistence.Interfaces` project (CLA-0007). Modules never see EF Core types. A store maps EF Core entities to aggregates (CLA-0048), or to read models.
- **Messages are not HTTP DTOs.** The request and response DTOs of a controller (CLA-0005) are separate types. Controllers map between DTOs and messages.

## Consequences

- Contracts are cheap to reference, free of infrastructure, and usable over any transport (CLA-0001).
- The compiler does not check a message's result type at the call site, because the caller cannot see the handler. The startup check, the module's own tests and the caller's tests with the module composed for real (CLA-0004) catch a mismatch.
- The same concept can exist as an entity, as a message in each module that needs it, and as a DTO. The duplication is deliberate: each layer can change without breaking the others.
- Architecture tests check that:
  - Interfaces projects have no project or package references;
  - types in Interfaces projects are messages or the module marker (CLA-0067);
  - messages have no methods beyond those the compiler generates for records;
  - no message type appears in the public surface of more than one Interfaces assembly.
