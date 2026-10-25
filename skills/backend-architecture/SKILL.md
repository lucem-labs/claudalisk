---
name: backend-architecture
description: Claudalisk backend architecture decisions (ADRs) for the .NET modular monolith. Covers modules and their Interfaces projects, the Host composition root, module registration, module-owned APIs and thin controllers, DTOs and mapping, feature folders, Domain projects and the dispatcher, command, query and event naming, and RESTful API design (bounded contexts, aggregates as resources, domain commands, hypermedia links and actions, HTTP semantics and Problem Details). Use when writing, reviewing or restructuring backend C# code or project references in a claudalisk app.
paths:
  - "backend/**/*.cs"
  - "backend/**/*.csproj"
  - "**/*.slnx"
user-invocable: false
---

# Backend architecture

These are claudalisk's decisions for backend code. The app's `AGENTS.md` wins where it lists a deviation (CLA-0028). Before changing code that one of these decisions covers, read the ADR.

- [CLA-0001](${CLAUDE_PLUGIN_ROOT}/adr/0001-modular-monolith.md) (accepted): one deployable app with one Host composition root. Features are modules, and a call behind a module boundary may be in-process, queued or remote.
- [CLA-0002](${CLAUDE_PLUGIN_ROOT}/adr/0002-interfaces-projects.md) (accepted): modules and the API reference only `*.Interfaces` projects. Only the Host and tests reference implementations.
- [CLA-0003](${CLAUDE_PLUGIN_ROOT}/adr/0003-lean-interfaces-projects.md) (accepted): interfaces pass messages, which are logic-free POCOs owned by one Interfaces project. Never share them across Interfaces projects, never call them models, and add no references to other Interfaces projects, EF Core or MVC.
- [CLA-0004](${CLAUDE_PLUGIN_ROOT}/adr/0004-module-registration.md) (accepted): modules register themselves idempotently and declare their dependencies.
- [CLA-0005](${CLAUDE_PLUGIN_ROOT}/adr/0005-thin-controllers-and-mapping.md) (accepted): a module may expose its own controllers, and controllers do HTTP only. DTOs live next to their controller and may use MVC but never EF Core. Mapping is internal extension methods.
- [CLA-0006](${CLAUDE_PLUGIN_ROOT}/adr/0006-architecture-tests-by-convention.md) (proposed): architecture tests find modules by naming convention, not hand-kept lists.
- [CLA-0007](${CLAUDE_PLUGIN_ROOT}/adr/0007-persistence-owns-ef-core.md) (accepted): each module owns a schema in one database, with its own DbContext, migrations and store contracts, and nothing crosses schemas. Atomic cross-module work uses a composition module's `IUnitOfWork`, and later work uses the owning module's queue.
- [CLA-0041](${CLAUDE_PLUGIN_ROOT}/adr/0041-module-api-is-a-bounded-context.md) (proposed): a module's API is its bounded context. Names come from its ubiquitous language, a resource belongs to one module, and the API changes by addition without versions.
- [CLA-0042](${CLAUDE_PLUGIN_ROOT}/adr/0042-resources-are-aggregates.md) (proposed): aggregate roots are resources with one URL and child entities live under their root. Plain edits use PUT or PATCH, and read models are their own GET resources.
- [CLA-0043](${CLAUDE_PLUGIN_ROOT}/adr/0043-state-changes-are-domain-commands.md) (proposed): state changes are POSTs to a sub-resource named after the domain command, such as `/cancel`. Never write status fields directly.
- [CLA-0044](${CLAUDE_PLUGIN_ROOT}/adr/0044-hypermedia-links-and-actions.md) (proposed): representations carry HAL-style `_links` and the `_actions` the aggregate allows now, and the UI shows only those actions.
- [CLA-0045](${CLAUDE_PLUGIN_ROOT}/adr/0045-http-semantics-and-problem-details.md) (proposed): standard status codes, RFC 9457 Problem Details with a `type` per domain error, and ETag with If-Match on writes.
- [CLA-0046](${CLAUDE_PLUGIN_ROOT}/adr/0046-openapi-document.md) (proposed): the OpenAPI document groups endpoints by module through a registration convention. Frontend API types are generated from it and checked in CI.
- [CLA-0047](${CLAUDE_PLUGIN_ROOT}/adr/0047-modules-organized-by-feature.md) (proposed): a module has `Features/<UseCase>/` folders, one per command, query or plain CRUD resource. Each holds its controller, DTOs, request, handler and mapping, and tests mirror features.
- [CLA-0048](${CLAUDE_PLUGIN_ROOT}/adr/0048-aggregates-in-a-domain-project.md) (proposed): aggregates live in a plain-C# `<Root>.Modules.<Name>.Domain` project, and the Persistence project's stores map EF Core entities to and from them.
- [CLA-0049](${CLAUDE_PLUGIN_ROOT}/adr/0049-features-go-through-the-dispatcher.md) (proposed): every feature sends its commands and queries through the dispatcher, with one handler each. Logging, validation and the unit of work are pipeline steps.
- [CLA-0050](${CLAUDE_PLUGIN_ROOT}/adr/0050-module-dependencies-go-down-feature-first.md) (proposed): inside a module, features never reference each other and dependencies go down to Shared and Domain. Domain rules start in the aggregate. Other code starts in its feature and moves down on its second use.
- [CLA-0052](${CLAUDE_PLUGIN_ROOT}/adr/0052-cqrs-naming.md) (proposed): `<Verb><Noun>Command`, `Get`/`List`/`Search` + `Query`, `<Message>Handler`, past-tense events with no suffix, `I<Aggregate>Store` and `I<Aggregate>ReadStore`, and identifiers in US English.
- [CLA-0057](${CLAUDE_PLUGIN_ROOT}/adr/0057-validation-fluentvalidation-and-aggregates.md) (proposed): FluentValidation `<Message>Validator` classes check input shape in the pipeline and return `400`; domain rules live in the aggregate and return `409`.
- [CLA-0058](${CLAUDE_PLUGIN_ROOT}/adr/0058-queued-work-jobs-library.md) (proposed): a job is a command run later by the claudalisk jobs library; only modules with background work have a `jobs` table; queueing joins the caller's unit of work and stays behind the module's contract; the transport is PostgreSQL now and swappable for SQS.
- [CLA-0059](${CLAUDE_PLUGIN_ROOT}/adr/0059-batch-jobs.md) (proposed): long jobs implement the batch-job type; the library commits each batch with its checkpoint in its own unit of work, and retries resume from the checkpoint.
- [CLA-0060](${CLAUDE_PLUGIN_ROOT}/adr/0060-jobs-router-and-job-resource.md) (proposed): module endpoints start jobs and return `202` with a link to `/api/jobs/{module}/{id}`; the jobs router serves a standard job representation with a `result` link to the resource the job changed.
- [CLA-0061](${CLAUDE_PLUGIN_ROOT}/adr/0061-scheduler-module.md) (proposed): recurring work comes from the scheduler module: cron, command and target module, sent through the dispatcher, once per fire time; an owner-configured schedule counts as an owner trigger.
- [CLA-0062](${CLAUDE_PLUGIN_ROOT}/adr/0062-claudalisk-nuget-packages.md) (proposed): the dispatcher, jobs, transports and scheduler ship as versioned claudalisk NuGet packages that apps pin.
- [CLA-0063](${CLAUDE_PLUGIN_ROOT}/adr/0063-domain-exceptions-and-one-problem-handler.md) (proposed): aggregates and handlers throw `DomainException` subclasses with a slug, title and kind; one API-wide handler maps them, validation (400) and concurrency (412) to Problem Details.
- [CLA-0064](${CLAUDE_PLUGIN_ROOT}/adr/0064-repository-and-test-layout.md) (proposed): `backend/`, `frontend/` (with `src/` and `e2e/`) and `scripts/`; one `<Root>.Modules.<Name>.Tests` project per module with folders that mirror features, plus `<Root>.ArchitectureTests`.
