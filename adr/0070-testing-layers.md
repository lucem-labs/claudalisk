# CLA-0070: Every behaviour change ships with tests, and each rule is tested at the lowest layer that can see it

- **Status:** accepted
- **Date:** 2026-10-26
- **Area:** testing
- **Enforced by:** CI; reviewer (each changed rule has a test at its layer; `exact: true` and the other `getBy*` locators); architecture tests (no faked stores, dispatcher or DbContext in test projects); `scripts/check-e2e-locators.mjs` (no CSS or element locators in `frontend/e2e`)
- **Issue:** #89

## Context

Without a rule for which kind of test covers which behaviour, a business rule is tested only through the browser, or the same rule is tested at every layer. Both make the suite slow, and the first makes a failure hard to locate.

## Decision

- **Every feature or behaviour change adds automated tests,** at the layer below that can see the rule. A change to boundaries adds architecture tests. A UI change adds a Playwright end-to-end test. A change to store or helper logic in the frontend adds a Vitest test.
- **Run the tests before you report the work as done.** Report a test that cannot be added or run. Never skip it silently.
- **The layers:**

  | Layer | Tests | How | Where |
  |---|---|---|---|
  | Domain | Aggregate invariants, command methods, the `CanX` answers behind `_actions`, recorded domain events, the version | Plain C#, with no DI, database or dispatcher (CLA-0048) | the module's test project (CLA-0064) |
  | Feature | One command or query inside its module: validation, handler, store, mapping, unit of work, queued jobs | `SendAsync` through the real dispatcher and pipeline, with the module composed for real on PostgreSQL (CLA-0018). No HTTP | the module's test project, in the feature's folder |
  | API | HTTP only: routes, status codes, Problem Details, `ETag` and `If-Match`, `_links` and `_actions`, the `202` job link | `WebApplicationFactory` against the composed Host (CLA-0001) | the module's test project, in the feature's folder |
  | Architecture | Boundaries and conventions (CLA-0006) | Reflection over the built assemblies | `<Root>.ArchitectureTests` |
  | Frontend unit | Logic in `model` and `lib` segments | Vitest (CLA-0014) | next to the code |
  | End to end | User journeys across the UI and the API | Playwright | `frontend/e2e/` |

- **Test a rule once, at the lowest layer that can see it.**
  - A business rule is a Domain test. A rule that needs several aggregates, a store or a job is a Feature test.
  - An API test checks only how the result becomes HTTP.
  - An end-to-end test follows a journey, such as "create an order and cancel it". It never checks a business rule that a backend test can check (CLA-0044).
- **Every feature has at least one Feature test.** A feature with an endpoint also has an API test for each status it can return.
- **End-to-end tests find elements by role and accessible name (`getByRole`), by label (`getByLabel`) or by `data-testid` (`getByTestId`).**
  - They never use a CSS class, an element type or a structural selector, because those change when the design changes and the journey does not.
  - Role and name come first, then label. A `data-testid` is for elements with no meaningful role or name, such as repeated rows. A control without an accessible name gets one in the component.
  - A role or label name passes `exact: true` unless the test means a substring.
  - `.first()`, `.nth()` and `.last()` may pick among one locator's matches, and `getByText` with `exact: true` only asserts on text.
  - `scripts/check-e2e-locators.mjs` fails on CSS and element locators anywhere in `frontend/e2e`, and the frontend's `lint` script runs it.
- **Fakes only at the edges.**
  - Fake only third-party APIs (CLA-0013) and time (CLA-0020). Do not fake stores, the dispatcher, the unit of work or the database.
  - A caller's Feature test composes the modules it calls for real. When the called module is not part of the behaviour under test, the test registers a stub `IHandler` for the message instead, so the pipeline still runs (CLA-0003).
- **No separate contract tests.** The frontend's types are generated from the OpenAPI document, and `tsc` fails on a breaking change (CLA-0046).
- **No coverage target.** A percentage does not show whether the rules are tested.

## Consequences

- "Done" includes the tests and their results.
- When a test fails, its layer shows where the fault is: in the aggregate, in the feature's wiring, in the HTTP mapping or in the UI.
- Most tests are Domain and Feature tests, which run without a browser or an HTTP server. Feature tests need Docker (CLA-0018), and template databases keep them fast (CLA-0019).
- A design change that keeps the roles, labels and test ids does not break an end-to-end test.
