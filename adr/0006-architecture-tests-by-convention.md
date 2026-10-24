# CLA-0006: Architecture tests discover modules by naming convention

- **Status:** proposed
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** architecture tests
- **Issue:** #17

## Context

In two existing apps, the architecture tests listed module assemblies by hand ("add every new module to its lists"). A module left off a list is silently unchecked. Architecture tests are generated once and then owned by the app, so the plugin can't fix a gap later.

## Decision

- Architecture tests load `<Root>.Modules.*` assemblies by naming convention and require an `.Interfaces` twin for each.
- A safety test asserts that the number of modules found equals the number of module csproj files.
- The generated rules cover CLA-0002 and CLA-0003 (including the message rules), plus: controllers live only in the API project or a module implementation project, DTOs live in `Dtos` folders and are free of EF Core, only persistence projects use EF Core, no project references another module's persistence project, every entity maps to its own context's schema, and no foreign key crosses schemas (CLA-0007).

## Consequences

- New modules are covered without editing the tests.
