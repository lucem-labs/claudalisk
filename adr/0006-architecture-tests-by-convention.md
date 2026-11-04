# CLA-0006: Architecture tests discover modules by naming convention and prove that each rule can fail

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** backend-architecture
- **Enforced by:** architecture tests (the module count matches the csproj files; every rule's scan finds something; every rule has a guard test)
- **Issue:** #83

## Context

Architecture tests that list module assemblies by hand ("add every new module to its lists") silently skip a module that is left off a list. The app owns the architecture tests after generation, so the plugin cannot fix a gap later.

A rule that scans code also passes when its scan finds nothing. A renamed folder, a namespace typo or a changed suffix leaves the rule green while it checks nothing. A rule whose check is wrong passes the same way, because no test shows that it can fail.

A full list of the rules in this ADR drifts from the ADRs that decide them.

## Decision

- Architecture tests find modules by naming convention. A module is an assembly named `<Root>.Modules.<Name>` with no further suffix. Test projects, which end in `.Tests`, are not modules (CLA-0064). Its other projects are found by suffix: `.Interfaces`, `.Persistence`, `.Persistence.Interfaces` and, under CLA-0048, `.Domain`. Every module must have an `.Interfaces` project.
- A safety test asserts that the number of modules found equals the number of module implementation csproj files.
- **Every rule that scans code asserts that its scan found something.** Before it checks the types, files or project references it found, it fails when there are none, with a message that names the rule and what it looked for.
- **Every rule has a guard test.** The guard test feeds the rule a bad example, such as a type or a csproj kept in the test project for this purpose, and asserts that the rule flags it. The rule and its guard test run the same check, so the check takes what it scans as input.
- **Rules that pair types find them by name.** A rule that checks one type against another uses the naming patterns of CLA-0052, such as an aggregate and its `<Aggregate>Entity` (CLA-0056).
- **The rules are listed where they are decided.** Each ADR that an architecture test enforces names the rule in its "Enforced by" line. The architecture test file that the scaffold generates has a test for each of those rules and names its ADR. This ADR does not repeat the list.

## Consequences

- New modules are covered without changes to the tests.
- A rename that empties a scan fails the rule instead of turning it green.
- A new rule changes its own ADR's "Enforced by" line and the test file, not this ADR. Until the scaffold generates the test file, an app writes its tests from the "Enforced by" lines.
