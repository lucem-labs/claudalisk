---
name: backend-architecture
description: Claudalisk backend architecture decisions (ADRs) for the .NET modular monolith - modules and their Interfaces projects, the Host composition root, module registration, module-owned APIs and thin controllers, DTOs and mapping. Use when writing, reviewing or restructuring backend C# code or project references in a claudalisk app.
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
- [CLA-0003](${CLAUDE_PLUGIN_ROOT}/adr/0003-lean-interfaces-projects.md) (accepted): interfaces pass messages: logic-free POCOs owned by one Interfaces project, never shared across Interfaces projects, never called models; no references to other Interfaces projects, EF Core or MVC.
- [CLA-0004](${CLAUDE_PLUGIN_ROOT}/adr/0004-module-registration.md) (accepted): modules register themselves idempotently and declare their dependencies.
- [CLA-0005](${CLAUDE_PLUGIN_ROOT}/adr/0005-thin-controllers-and-mapping.md) (accepted): a module may expose its own controllers; controllers do HTTP only; DTOs live in a `Dtos` folder, may use MVC but never EF Core; mapping is internal extension methods.
- [CLA-0006](${CLAUDE_PLUGIN_ROOT}/adr/0006-architecture-tests-by-convention.md) (proposed): architecture tests find modules by naming convention, not hand-kept lists.
- [CLA-0007](${CLAUDE_PLUGIN_ROOT}/adr/0007-persistence-owns-ef-core.md) (accepted): each module owns a schema in one database, with its own DbContext, migrations and store contracts, and nothing crosses schemas; atomic cross-module work goes through a composition module's `IUnitOfWork`, later work through the owning module's queue.
- [CLA-0035](${CLAUDE_PLUGIN_ROOT}/adr/0035-no-code-comments.md) (accepted): code carries no comments (no line, block or XML doc comments, none in config); intent goes into names, tests, commits and ADRs.
