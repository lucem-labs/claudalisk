---
name: backend-architecture
description: Claudalisk backend architecture decisions (ADRs) for the .NET modular monolith - modules and their Interfaces projects, the Host composition root, module registration, thin controllers, DTOs and mapping. Use when writing, reviewing or restructuring backend C# code or project references in a claudalisk app.
paths:
  - "backend/**/*.cs"
  - "backend/**/*.csproj"
  - "**/*.slnx"
user-invocable: false
---

# Backend architecture

These are claudalisk's decisions for backend code. The app's own `AGENTS.md` wins where it lists a deviation (CLA-0028). Before changing code that one of these decisions covers, read the ADR.

- [CLA-0001](${CLAUDE_PLUGIN_ROOT}/adr/0001-modular-monolith.md) (accepted): one deployable app with one Host composition root; features are modules whose boundary is their contract, so a call behind it may be in-process, queued or remote.
- [CLA-0002](${CLAUDE_PLUGIN_ROOT}/adr/0002-interfaces-projects.md) (accepted): modules and the API reference only `*.Interfaces` projects; only the Host and tests reference implementations.
- [CLA-0003](${CLAUDE_PLUGIN_ROOT}/adr/0003-lean-interfaces-projects.md) (accepted): Interfaces projects reference no other Interfaces projects, no EF Core and no MVC; one interface per file.
- [CLA-0004](${CLAUDE_PLUGIN_ROOT}/adr/0004-module-registration.md) (accepted): modules register themselves idempotently and declare their dependencies.
- [CLA-0005](${CLAUDE_PLUGIN_ROOT}/adr/0005-thin-controllers-and-mapping.md) (accepted): controllers do HTTP only; DTOs live in `Contracts`; mapping is internal extension methods.
- [CLA-0006](${CLAUDE_PLUGIN_ROOT}/adr/0006-architecture-tests-by-convention.md) (proposed): architecture tests find modules by naming convention, not hand-kept lists.
- [CLA-0007](${CLAUDE_PLUGIN_ROOT}/adr/0007-persistence-owns-ef-core.md) (accepted): only the Persistence project uses EF Core; modules use store contracts.
