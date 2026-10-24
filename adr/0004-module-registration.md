# CLA-0004: Module registration is idempotent and declares dependencies

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** module registration tests

## Context

Two existing apps use the same registration code, which differs only in names. It keeps the Host down to a list of modules, while each module stays responsible for its own wiring. That includes its controllers, if it exposes an API (CLA-0005).

## Decision

- Each module implements the app's module interface and registers its own internal implementations.
- A module declares the module contracts it depends on, as marker interfaces from Interfaces projects. It never declares implementation types.
- Registration resolves modules in dependency order and rejects missing, ambiguous and circular dependencies before any module registers a service.
- It adds the controllers from each module's assembly.
- It is idempotent: registering a module twice is a no-op.
- Each module can be composed in isolation, with only its declared dependencies.

## How the two apps implement it

- **The pieces:**
  - a shared module interface, through which a module lists its dependencies and registers its services;
  - an empty marker interface in each module's Interfaces project;
  - one public module class per implementation project, with everything it registers kept internal;
  - the API project, which is a module itself and registers API-wide concerns such as exception filters;
  - a Host that only lists module instances in one `Add<Root>Modules(...)` call.
- **The registration call:**
  - it orders the modules by their declared dependencies;
  - it validates the whole set first, and fails with a message that names the missing, ambiguous or circular dependency;
  - it then registers each new module once and adds its controllers.

  Its state lives in the service collection, so separate collections, such as those in tests, don't affect each other.
- **Tests cover:**
  - the dependency failures;
  - registration order;
  - repeated calls and reuse of earlier registrations;
  - each module composing in isolation;
  - the Host's full module list resolving every service.

## Consequences

- Adding a module means writing:
  - its marker interface;
  - its module class with its declared dependencies;
  - one line in the Host;
  - a dependency on its marker in each module that consumes it.
- Forgetting to declare a dependency fails at startup with a message that names the missing marker.
- new-app generates the module interface, the registration call and its tests.
