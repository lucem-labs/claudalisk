# CLA-0070: Each rule is tested at the lowest layer that can see it

- **Status:** accepted
- **Date:** 2026-10-26
- **Area:** testing
- **Enforced by:** reviewer; architecture tests (no faked stores, dispatcher or DbContext in test projects)

## Context

CLA-0016 asks for tests with every change, but no ADR says which kind of test covers which behaviour. Without that rule, a business rule is tested only through the browser, or the same rule is tested at every layer. Both make the suite slow, and the first makes a failure hard to locate.

## Decision

- **The layers:**

  | Layer | Tests | How | Where |
  |---|---|---|---|
  | Domain | Aggregate invariants, command methods, the `CanX` answers behind `_actions`, recorded domain events, the version | Plain C#, with no DI, database or dispatcher (CLA-0048) | the module's test project, next to the feature (CLA-0064) |
  | Feature | One command or query inside its module: validation, handler, store, mapping, unit of work, queued jobs | `SendAsync` through the real dispatcher and pipeline, with the module composed for real on PostgreSQL (CLA-0018). No HTTP | the module's test project, in the feature's folder |
  | API | HTTP only: routes, status codes, Problem Details, `ETag` and `If-Match`, `_links` and `_actions`, the `202` job link | `WebApplicationFactory` against the composed Host (CLA-0001) | the module's test project, in the feature's folder |
  | Architecture | Boundaries and conventions (CLA-0006) | Reflection over the built assemblies | `<Root>.ArchitectureTests` |
  | Frontend unit | Logic in `model` and `lib` segments | Vitest (CLA-0065) | next to the code |
  | End to end | User journeys across the UI and the API | Playwright (CLA-0016) | `frontend/e2e/` |

- **Test a rule once, at the lowest layer that can see it.**
  - A business rule is a Domain test. A rule that needs several aggregates, a store or a job is a Feature test.
  - An API test checks only how the result becomes HTTP. It does not test the business rule again.
  - An end-to-end test follows a journey, such as "create an order and cancel it". It never checks a business rule that a backend test can check (CLA-0044).
- **Every feature has at least one Feature test.** A feature with an endpoint also has an API test for each status it can return.
- **Fakes only at the edges.** Fake only third-party APIs (CLA-0013) and time (CLA-0020). Do not fake stores, the dispatcher, the unit of work or the database. A caller's Feature test composes the modules it calls for real, or fakes `IDispatcher` when the called module is not part of the behaviour under test (CLA-0067).
- **No separate contract tests.** The frontend's types are generated from the OpenAPI document, and `tsc` fails on a breaking change (CLA-0046).
- **No coverage target.** A percentage does not show whether the rules are tested. The reviewer checks that each changed rule has a test at its layer.

## Consequences

- When a test fails, its layer shows where the fault is: in the aggregate, in the feature's wiring, in the HTTP mapping, or in the UI.
- Most tests are Domain and Feature tests. They run without a browser or an HTTP server.
- Feature tests need Docker, like every database test (CLA-0018). Template databases keep them fast (CLA-0019).
