# CLA-0062: Infrastructure ships as claudalisk NuGet packages

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** reviewer (no copied infrastructure in an app); package CI in lucem-labs/claudalisk-dotnet

## Decision

- **Infrastructure that every app needs, and that has no business meaning, is a claudalisk NuGet package.** It is never a project in the app or a copy of another app's code. This covers the plumbing that the backend ADRs describe, such as:
  - domain errors and the Problem Details handler (CLA-0063);
  - module registration (CLA-0004);
  - the data source, the per-scope connection and the unit of work (CLA-0007);
  - the dispatcher and its pipeline (CLA-0049);
  - jobs, their transports and the jobs router (CLA-0058, CLA-0059, CLA-0060);
  - the scheduler (CLA-0061);
  - endpoints that every app has, such as health (CLA-0001).
- **The packages live in [lucem-labs/claudalisk-dotnet](https://github.com/lucem-labs/claudalisk-dotnet)**, separate from this repository, so that this one stays focused on the plugin and its AI tooling. They are published to nuget.org.
- **Package names and boundaries are decided in that repository** and can change as the packages are built. Its README lists the current packages. Where an ADR needs a package by name, as `Claudalisk.Domain` for Domain projects (CLA-0048), the ADR names it.
- An app pins exact package versions. A fix reaches an app as a version bump in a normal pull request.
- Each package has its own tests, including Testcontainers tests against real PostgreSQL (CLA-0018). The CI of claudalisk-dotnet runs them.

## Consequences

- One implementation of the plumbing serves every app.
- An app cannot change the packages' behaviour by editing their code. It adds pipeline steps or options, or asks for a change in claudalisk-dotnet.
- The ADRs state what the infrastructure must do. The packages decide how.
