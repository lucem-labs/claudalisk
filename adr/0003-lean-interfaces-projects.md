# CLA-0003: Module contracts are messages: POCOs in a lean Interfaces project, sent through the dispatcher

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** architecture tests (Interfaces projects hold only messages and the module marker, and reference no project or package; messages implement no interface, have no base type, have no methods beyond those the compiler generates for records and reference no EF Core, MVC or service types; no message type appears in the public surface of more than one Interfaces assembly); the dispatcher's startup check; reviewer

## Context

If the objects passed between modules are called "models", people confuse them with database models (EF Core entities), and persistence types and behaviour leak across module boundaries. A distinct name keeps the separation visible in code and in conversation.

A module could also offer service interfaces as facades that dispatch inside. That would make three things per operation (a method, a message and a handler), and a facade invites logic that skips the pipeline (CLA-0049).

## Decision

- **The types that modules exchange are messages:** commands and queries in, results out, and events. They are not models. "Request" means only an HTTP request DTO (CLA-0005).
- **Messages are POCOs.** They are plain data, with properties and an optional constructor, preferably immutable records. They have no behaviour and no references to EF Core, MVC or service types. They implement no interface and have no base type.
- **An Interfaces project holds only messages and the module marker**, an empty class (CLA-0004), one message per file. It has no service interfaces and no DTOs, and it references no project and no package, not even the dispatcher's.
- **A message belongs to one Interfaces project.** Another Interfaces project never reuses it, by reference or through a shared "common" contracts project. When two modules need similar data, each defines its own message, and the consuming side maps between them (CLA-0069). Inside one Interfaces project, operations can share a message.
- **The handler declares the result.** A message does not say what it returns. Its one handler, in the owning module's implementation project, implements `IHandler<TMessage, TResult>`. A caller names the result type when it sends: `dispatcher.SendAsync<OrderSummaryResult>(new GetOrderSummaryQuery(orderId))`. Names follow CLA-0052.
- **The dispatcher checks the pairing.** At startup it fails when a message in an Interfaces project has no handler or more than one. A send whose result type does not match the handler's fails with an error that names both types.
- **A module calls another module only by sending that module's messages through the dispatcher.** The call goes through the same pipeline as any other: logging, validation and the caller's unit of work (CLA-0007, CLA-0049).
- **Now or later is part of the contract.** `SendAsync` always runs the target's handler and waits for it.
  - A message whose result is the answer runs to completion.
  - A command whose result is a `JobReference`, such as `RequestReindexCommand`, means "accepted, runs later". Its handler queues an internal job (CLA-0058) and returns at once. The job's own command is internal and never appears in the Interfaces project.
  - Moving an operation from immediate to background changes its result type, so callers see the change.
- **Local or remote is the Host's choice.** Module registration records where each module runs, in-process by default. A module that moves out of process (CLA-0001) is registered with a remote transport, and the dispatcher routes its messages there. Callers do not change. A later ADR designs remote transports.

## Consequences

- Contracts are cheap to reference, free of infrastructure, and usable over any transport (CLA-0001).
- Each operation is one message and one handler, and a module's operations are found by browsing its Interfaces project.
- The compiler does not check a message's result type at the call site. The startup check and the caller's tests, which use the real dispatcher with the target composed or stubbed (CLA-0070), catch a mismatch.
- The same concept can exist as an entity, as a message in each module that needs it, and as a DTO. The duplication is deliberate: each layer can change without breaking the others.
- A remote call cannot join the caller's unit of work, so callers of a remote module switch to queued work for anything that must be atomic (CLA-0007).
