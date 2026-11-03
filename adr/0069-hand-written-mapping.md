# CLA-0069: Mapping is hand-written, with no AutoMapper or other mapping library

- **Status:** accepted
- **Date:** 2026-10-26
- **Area:** backend-architecture
- **Enforced by:** architecture tests (no project references a mapping library package); reviewer

## Context

Mapping libraries such as AutoMapper match properties by name at runtime. A renamed property maps to nothing without a compile error, a mapping profile hides which code reads which field, and an agent cannot follow a mapping by reading the code. The layers that map are deliberately separate (CLA-0003), so their mappings must stay visible.

## Decision

- **Mapping at a boundary is internal extension methods in the consuming project.** This covers:
  - the module's own DTOs to and from messages, next to the controller, or in `Dtos/` with a DTO that several features return (CLA-0005, CLA-0047). A module never maps to or from another module's DTOs, because it never sees them;
  - the messages of one module to those of another;
  - other modules' messages to Domain types, in the handler (CLA-0048);
  - aggregates to messages and results, in the implementation project (CLA-0048);
  - the module's aggregates and read models to its response DTOs, in the feature or in `Dtos/`, calling the Domain project's pure rules for `_actions` (CLA-0047, CLA-0048);
  - EF Core entities to and from aggregates or read models, in a persistence project (CLA-0007, CLA-0048).
- **No mapping libraries.** Do not reference AutoMapper, Mapster, Mapperly, or any other package that maps objects by convention, reflection or code generation.
- **No mapper interfaces.** Do not write `IMapper<TFrom, TTo>` or similar abstractions. A mapping is a plain method that the compiler checks.

## Consequences

- A renamed or removed property breaks the build where it is mapped.
- Each mapping is a few lines of code that a reader can find with "go to definition".
- Mappings are more code to write than a convention-based profile. The tests of the feature cover them.
