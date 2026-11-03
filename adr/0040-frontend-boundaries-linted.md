# CLA-0040: Frontend layer boundaries are checked by Steiger in CI

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** frontend
- **Enforced by:** CI

## Decision

- [Steiger](https://github.com/feature-sliced/steiger), the official Feature-Sliced Design linter, runs over `frontend/src` as a CI job, next to oxlint.
- A Steiger error fails CI. Its checks include imports that go up a layer or across slices, imports that skip a slice's public API, and slices or segments in the wrong place.
- Steiger's `fsd/inconsistent-naming` rule stays on. It needs the slices on a layer to be all singular or all plural. Entity slices take the module names (CLA-0037), and module names are singular (CLA-0001), so the rule checks the module names too. An app whose entity slices fail it renames the module. Until the rename lands, the app may turn the rule off for `entities` only, as a deviation that names the rename issue (CLA-0028).
- If an app turns off any other rule, it turns it off in the Steiger config and lists it in the app's `AGENTS.md` (CLA-0028).

## Consequences

- The boundaries of CLA-0036 do not depend on the reviewer noticing a bad import.
- The frontend gets the same kind of check that the backend has in its architecture tests (CLA-0006).
