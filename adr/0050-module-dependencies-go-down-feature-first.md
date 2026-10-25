# CLA-0050: Inside a module, dependencies go down and code starts in its feature

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** architecture tests (CLA-0006), reviewer

## Context

This is the backend's version of Feature-Sliced Design's import rule and its "pages first" rule (CLA-0036). It keeps features independent without forcing every helper into a shared place up front.

## Decision

- **Dependencies go down.** Within a module:
  - features may use the module's `Shared` folder, its Domain project and its store contracts (the module's `Shared` folder is not the `<Root>.Shared` project);
  - `Shared` may use the Domain project;
  - nothing in the module references a feature.
- **Features never reference each other.** A feature doesn't use another feature's request, handler, DTOs or mapping. When two features need the same thing, it moves down.
- **Only the module's contracts are public to other modules.** Everything in the implementation and Persistence projects is `internal`, except the module class and what module registration needs. The Domain and Persistence.Interfaces projects are referenced only by the module's own projects (CLA-0048). Other modules see only the Interfaces project (CLA-0002).
- **Domain rules start in the aggregate.** An invariant or a rule about which commands are allowed belongs in the aggregate from the start (CLA-0048), even when only one feature uses it.
- **Everything else is feature first.** Other code starts in the feature that needs it, and moves down only on its second use:
  - a technical helper, such as a parser or a formatter, moves to the module's `Shared` folder;
  - code moves to `<Root>.Shared` only when a second module needs it, and only if it has no business meaning.
- A folder or project is never created for code that only one feature uses.

## Consequences

- A feature can be changed or deleted without breaking another feature.
- Duplication between two features lasts only until a second use, and the move down is a normal refactor in the change that adds that use.
- Architecture tests check the rules by namespace: a type in `Features.<A>` may not reference `Features.<B>`, and `Shared` may not reference `Features`.
