# CLA-0006: Architecture tests discover modules by naming convention

- **Status:** proposed
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** architecture tests
- **Issue:** #17

## Context

In two existing apps, the architecture tests listed module assemblies by hand ("add every new module to its lists"). A module left off a list is silently unchecked. Architecture tests are generated once and then owned by the app, so the plugin can't fix a gap later.

## Decision

- Architecture tests find modules by naming convention. A module is an assembly named `<Root>.Modules.<Name>` with no further suffix. Its other projects are found by suffix: `.Interfaces`, `.Persistence`, `.Persistence.Interfaces` and, under the proposed CLA-0048, `.Domain`. Every module must have an `.Interfaces` project.
- A safety test asserts that the number of modules found equals the number of module implementation csproj files.
- The generated rules cover CLA-0002 and CLA-0003 (including the message rules), plus: controllers live only in the API project (`<Root>.Api`) or a module implementation project, DTOs live next to their controller and are free of EF Core, features don't reference each other and Domain projects reference only `<Root>.Shared` (CLA-0047, CLA-0048, CLA-0050), only persistence projects use EF Core, no project references another module's persistence project, every entity maps to its own context's schema, and no foreign key crosses schemas (CLA-0007).

## Consequences

- New modules are covered without editing the tests.
