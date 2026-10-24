# CLA-0001: The backend is a modular monolith

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** architecture tests (CLA-0002, CLA-0006), reviewer

## Context

Apps built with claudalisk are single-owner, local-first products that grow feature by feature. Splitting them into services would add network calls, deployment units and data-consistency problems without any scaling need.

## Decision

- The backend is one .NET 10 process against one PostgreSQL database.
- Features live in modules: a `<Root>.Modules.<Name>` implementation project, each with a `<Root>.Modules.<Name>.Interfaces` project for its public contracts.
- Module boundaries are compile-time boundaries, never network calls or separate databases.
- One Host project (`<Root>.Api.Host`) is the composition root.

## Consequences

- Boundaries are checked by tests, not by deployment topology.
- Cross-module calls are plain method calls through Interfaces projects.
