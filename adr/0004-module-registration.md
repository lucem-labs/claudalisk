# CLA-0004: Module registration is idempotent and declares dependencies

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** module registration tests

## Context

The Host should be only a list of modules. Each module stays responsible for its own wiring, including its controllers if it exposes an API (CLA-0005).

## Decision

- Each module implements the module interface from the claudalisk module registration package (CLA-0062) and registers its own internal implementations.
- A module declares the modules it depends on by their marker classes from Interfaces projects. It never declares implementation types.
- Registration resolves modules in dependency order. It rejects missing, ambiguous and circular dependencies before any module registers a service.
- It is idempotent: registering a module twice is a no-op.
- Each module can be composed in isolation, with only its declared dependencies.

## Implementation

- **The pieces:**
  - the module interface, through which a module lists its dependencies and registers its services;
  - an empty, sealed marker class in each module's Interfaces project, such as `OrdersContract`, which needs no package (CLA-0003);
  - one public module class per implementation project, with everything it registers kept internal;
  - a Host (`<Root>.Api`, CLA-0001) that lists module instances in one `AddModules(...)` call, and registers the app-wide concerns from the claudalisk packages, such as the Problem Details handler (CLA-0063).
- **The registration call:**
  - it orders the modules by their declared dependencies;
  - it validates the whole set first, and fails with a message that names the missing, ambiguous or circular dependency;
  - it then registers each new module once.

  Its state lives in the service collection, so separate collections (for example in tests) do not affect each other.
- **Controllers come in as application parts.** ASP.NET Core finds controllers only in the assemblies its `ApplicationPartManager` knows about, which by default is the entry assembly. Registration calls `AddControllers().AddApplicationPart(module.GetType().Assembly)` for each module that exposes an API, so its controllers are discovered although the Host never references their types. Controllers stay public, because ASP.NET Core ignores internal ones (CLA-0050).
- **Tests cover:**
  - the dependency failures;
  - registration order;
  - repeated calls and reuse of earlier registrations;
  - each module composing in isolation;
  - the full module list of the Host resolving every service;
  - each module's controllers being discovered.

## Consequences

- To add a module, write:
  - its marker class;
  - its module class with its declared dependencies;
  - one line in the Host;
  - a dependency on its marker in each module that consumes it.
- If a module forgets to declare a dependency, startup fails with a message that names the missing marker.
- new-app references the module registration package and generates the registration tests.
