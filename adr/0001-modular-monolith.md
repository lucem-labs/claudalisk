# CLA-0001: The backend is a modular monolith

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** architecture tests (CLA-0002, CLA-0006), reviewer

## Context

The main reason is to **prevent spaghetti code**. A vibe-coded app grows one plain-language request at a time. Without hard boundaries, each change reaches for the nearest code, and the app becomes impossible to reason about or change safely. Modules with explicit contracts give every feature a place to live and a boundary that tests can check.

A second reason is low operational complexity. These are single-owner, local-first apps, and one deployable unit is enough for them.

## Decision

- The backend is one deployable .NET 10 application. One Host project, `<Root>.Api`, is the composition root. It registers the modules and the app-wide concerns, and holds only endpoints with no business meaning. Endpoints and concerns that every app needs, such as health and the Problem Details handler, come from the claudalisk packages (CLA-0062).
- **Business logic that several modules need gets its own module.** It never goes into the Host.
- Features live in modules. Each module has a `<Root>.Modules.<Name>` implementation project, a `<Root>.Modules.<Name>.Interfaces` project for its public contracts, a `<Root>.Modules.<Name>.Domain` project (CLA-0048), and the persistence projects of CLA-0007.
- **The boundary is the contract, not the transport.** Modules talk only through their Interfaces projects (CLA-0002). Behind a contract, a call can be:
  - an in-process call (the default): a message sent through the dispatcher (CLA-0067);
  - queued background work, through jobs (CLA-0058);
  - a network call, or a module with its own database, when the module needs it. By default a module owns a schema in the app's one database (CLA-0007).
- The callers of a module do not change when its transport or data store changes.

## Consequences

- Architecture tests and review enforce the boundaries. Deployment topology does not.
- A module can move to queued work, its own database or a remote call without changes to its callers, if its contract stays the same.
- Design each contract so that any of these transports can serve it. Contracts pass messages: plain data that belongs to one Interfaces project. They never pass shared object graphs or EF Core entities (CLA-0003). A contract can rely on a transaction shared with the caller only when it is called in-process inside a composition module's unit of work (CLA-0007). A module that moves to its own database or behind a remote call loses that guarantee, and its callers switch to queued work.
- Work that crosses a queue or a network boundary is asynchronous and can fail independently. The caller handles retries and idempotency. The transport does not.
