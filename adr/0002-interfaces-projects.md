# CLA-0002: Modules are referenced only through their Interfaces projects

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** architecture tests

## Context

Without a hard rule, modules start reaching into each other's implementation types, and the monolith stops being modular.

## Decision

- The API project and other modules reference only `*.Interfaces` projects, never another module's implementation project.
- Only the Host (the composition root) and test projects reference implementation projects. The check reads `ProjectReference`s from the csproj files, so an unused reference also fails.
- Implementation assemblies do not depend on other implementation assemblies.

## Consequences

- Adding a module means adding an implementation project and an Interfaces project, and registering the module in the Host.
