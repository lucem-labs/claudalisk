# CLA-0004: Module registration is idempotent and declares dependencies

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** module registration tests

## Decision

- Each module implements the app's module marker interface, registers its own internal implementations, and declares the module contracts it depends on.
- Registration resolves modules in dependency order, detects cycles and ambiguous dependencies, and adds each module's MVC application parts.
- Registration is idempotent: registering a module twice is a no-op.
- Each module can be composed in isolation in tests.

## Consequences

- The Host lists modules; it doesn't wire their internals.
