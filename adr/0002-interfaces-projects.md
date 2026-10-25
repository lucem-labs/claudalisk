# CLA-0002: Modules are referenced only through their Interfaces projects

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** architecture tests

## Context

Without a hard rule, modules start to reach into the implementation types of other modules, and the monolith stops being modular.

## Decision

- The API project and other modules reference only `*.Interfaces` projects, never another module's implementation project.
- Only the Host (the composition root) and test projects reference implementation projects. The check reads `ProjectReference`s from the csproj files, so an unused reference also fails.
- Implementation assemblies do not depend on other implementation assemblies.
- Shared infrastructure projects that hold no code or data of a module are the exception: `<Root>.Shared` (module registration), `<Root>.Persistence` (the data source, the per-scope connection and the unit of work) and `<Root>.Persistence.Interfaces` (`IUnitOfWork`), all from CLA-0007. Modules and their persistence projects can reference them.

## Consequences

- To add a module, add its projects (CLA-0001, CLA-0007) and register the module in the Host.
