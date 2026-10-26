# CLA-0002: Modules are referenced only through their Interfaces projects

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** architecture tests

## Context

Without a hard rule, modules start to reach into the implementation types of other modules, and the monolith stops being modular.

## Decision

- Modules reference only other modules' `*.Interfaces` projects, never another module's implementation project.
- Only the Host (`<Root>.Api`, the composition root) and test projects reference implementation projects. The check reads `ProjectReference`s from the csproj files, so an unused reference also fails.
- Implementation assemblies do not depend on other implementation assemblies.
- Infrastructure with no business meaning comes from the claudalisk packages (CLA-0062), not from projects in the app: module registration (CLA-0004), and the data source, the per-scope connection and the unit of work (CLA-0007). Modules and their persistence projects reference those packages.
- `<Root>.Shared` holds only app code that two modules need and that has no business meaning (CLA-0050). Any module project can reference it.

## Consequences

- To add a module, add its projects (CLA-0001, CLA-0007) and register the module in the Host.
