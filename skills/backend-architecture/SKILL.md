---
name: backend-architecture
description: Claudalisk backend architecture decisions (ADRs) for the .NET modular monolith - modules and their Interfaces projects, the Host composition root, module registration, module-owned APIs and thin controllers, DTOs and mapping, feature folders, Domain projects and the dispatcher, and RESTful API design: bounded contexts, aggregates as resources, domain commands, hypermedia links and actions, HTTP semantics and Problem Details. Use when writing, reviewing or restructuring backend C# code or project references in a claudalisk app.
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
- [CLA-0005](${CLAUDE_PLUGIN_ROOT}/adr/0005-thin-controllers-and-mapping.md) (accepted): a module may expose its own controllers; controllers do HTTP only; DTOs live next to their controller, may use MVC but never EF Core; mapping is internal extension methods.
- [CLA-0006](${CLAUDE_PLUGIN_ROOT}/adr/0006-architecture-tests-by-convention.md) (proposed): architecture tests find modules by naming convention, not hand-kept lists.
- [CLA-0007](${CLAUDE_PLUGIN_ROOT}/adr/0007-persistence-owns-ef-core.md) (accepted): each module owns a schema in one database, with its own DbContext, migrations and store contracts, and nothing crosses schemas; atomic cross-module work goes through a composition module's `IUnitOfWork`, later work through the owning module's queue.
- [CLA-0041](${CLAUDE_PLUGIN_ROOT}/adr/0041-module-api-is-a-bounded-context.md) (proposed): a module's API is its bounded context: names come from its ubiquitous language, a resource belongs to one module, and the API changes by addition without versions.
- [CLA-0042](${CLAUDE_PLUGIN_ROOT}/adr/0042-resources-are-aggregates.md) (proposed): aggregate roots are resources with one URL, child entities live under their root, plain edits use PUT or PATCH, and read models are their own GET resources.
- [CLA-0043](${CLAUDE_PLUGIN_ROOT}/adr/0043-state-changes-are-domain-commands.md) (proposed): state changes are POSTs to a sub-resource named after the domain command, such as `/cancel`; status fields are never written directly.
- [CLA-0044](${CLAUDE_PLUGIN_ROOT}/adr/0044-hypermedia-links-and-actions.md) (proposed): representations carry HAL-style `_links` and the `_actions` the aggregate allows now; the UI shows only those actions.
- [CLA-0045](${CLAUDE_PLUGIN_ROOT}/adr/0045-http-semantics-and-problem-details.md) (proposed): standard status codes, RFC 9457 Problem Details with a `type` per domain error, and ETag with If-Match on writes.
- [CLA-0046](${CLAUDE_PLUGIN_ROOT}/adr/0046-openapi-document.md) (proposed): the OpenAPI document groups endpoints by module through a registration convention, and frontend API types are generated from it and checked in CI.
- [CLA-0047](${CLAUDE_PLUGIN_ROOT}/adr/0047-modules-organized-by-feature.md) (proposed): a module is organized by `Features/<UseCase>/` folders, one per command, query, or plain CRUD resource, each holding its controller, DTOs, request, handler and mapping; tests mirror features.
- [CLA-0048](${CLAUDE_PLUGIN_ROOT}/adr/0048-aggregates-in-a-domain-project.md) (proposed): aggregates live in a plain-C# `<Root>.Modules.<Name>.Domain` project; the Persistence project's stores map EF Core entities to and from them.
- [CLA-0049](${CLAUDE_PLUGIN_ROOT}/adr/0049-features-go-through-the-dispatcher.md) (proposed): every feature sends its request through the dispatcher; one handler per request; logging, validation and the unit of work are pipeline steps.
- [CLA-0050](${CLAUDE_PLUGIN_ROOT}/adr/0050-module-dependencies-go-down-feature-first.md) (proposed): inside a module, features never reference each other and dependencies go down to Shared and Domain; domain rules start in the aggregate, other code starts in its feature and moves down on its second use.
