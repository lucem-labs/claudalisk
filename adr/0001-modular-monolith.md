# CLA-0001: The backend is a modular monolith

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** architecture tests (CLA-0002; discovery by convention is proposed in CLA-0006), reviewer

## Context

The main reason is to **prevent spaghetti code**. A vibe-coded app grows one plain-language request at a time. Without hard boundaries, each change reaches for whatever code is closest, and the app becomes impossible to reason about or change safely. Modules with explicit contracts give every feature a place to live and a boundary that tests can check.

Keeping operational complexity low is a second reason. These are single-owner, local-first apps, and one deployable unit is enough for them.

## Decision

- The backend is one deployable .NET 10 application, with one Host project (`<Root>.Api.Host`) as the composition root and one API project (`<Root>.Api`) for cross-cutting endpoints and concerns.
- Features live in modules. Each module has a `<Root>.Modules.<Name>` implementation project, a `<Root>.Modules.<Name>.Interfaces` project for its public contracts, and the persistence projects of CLA-0007. The proposed CLA-0048 adds a Domain project.
- **The boundary is the contract, not the transport.** Modules talk only through their Interfaces projects (CLA-0002). Behind a contract, a call may be:
  - an in-process method call, the default;
  - queued background work, through PostgreSQL queues;
  - a network call, or a module with its own database, when a module needs it. By default a module owns a schema in the app's one database (CLA-0007).
- A module's callers don't change when its transport or data store changes.

## Consequences

- The boundaries are enforced by architecture tests and review, not by deployment topology.
- A module can move to queued work, its own database or a remote call without touching its callers, as long as its contract stays the same.
- Contracts must be designed so that any of these transports could serve them. They pass messages: plain data that belongs to one Interfaces project, never shared object graphs or EF Core entities (CLA-0003). They can rely on a transaction shared with the caller only when they are called in-process inside a composition module's unit of work (CLA-0007). A module that moves to its own database or behind a remote call loses that guarantee, and its callers switch to queued work.
- Work that crosses a queue or a network boundary is asynchronous and can fail independently. The caller handles retries and idempotency, not the transport.
