# CLA-0050: Inside a module, dependencies go down and code starts in its feature

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** architecture tests (CLA-0006), reviewer

## Context

This is the backend version of the import rule and the "pages first" rule of Feature-Sliced Design (CLA-0036). It keeps features independent, and it does not force every helper into a shared place at the start.

## Decision

- **Dependencies go down.** Within a module:
  - features can use the module's `Shared` folder, its Domain project and its store contracts (the module's `Shared` folder is not the `<Root>.Shared` project)
  - `Shared` can use the Domain project
  - nothing in the module references a feature
- **Features never reference each other.** A feature does not use the request, handler, DTOs or mapping of another feature. When two features need the same thing, it moves down.
- **Only a module's contracts are public to other modules.** Everything in the implementation and Persistence projects is `internal`, except the module class, the feature controllers, and what module registration needs. Controllers are `public` because ASP.NET Core discovers only public controllers. Only the module's projects itself reference the Domain and Persistence.Interfaces projects (CLA-0048). Other modules see only the Interfaces project (CLA-0002).
- **Domain rules start in the aggregate.** An invariant, or a rule about which commands are allowed, belongs in the aggregate from the start (CLA-0048), even when only one feature uses it.
- **All other code starts in the feature that needs it.** It moves down only on its second use:
  - a technical helper, such as a parser or a formatter, moves to the module's `Shared` folder
  - code moves to `<Root>.Shared` only when a second module needs it, and only if it has no business meaning
- Never create a folder or project for code that only one feature uses.

## Consequences

- A feature can change or go away without breaking another feature.
- Duplication between two features lasts only until a second use. The move down is a normal refactor in the change that adds that use.
- Architecture tests check the rules by namespace. A type in `Features.<A>` may not reference `Features.<B>`, and `Shared` may not reference `Features`.
