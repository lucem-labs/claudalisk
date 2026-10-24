# CLA-0003: Interfaces projects are lean

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** architecture tests

## Decision

- Interfaces projects do not reference other Interfaces projects, EF Core or ASP.NET Core MVC.
- One interface per file. Models exposed only by that interface live next to it.
- Persistence is reached through store contracts in a `*.Persistence.Interfaces` project (the shared one, or the module's own, CLA-0007); modules never see EF Core types.

## Consequences

- Contracts stay cheap to reference and free of infrastructure.
- A model shared by several interfaces is a sign that a boundary needs rethinking.
