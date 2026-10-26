# CLA-0016: Every behaviour change ships with tests

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** testing
- **Enforced by:** reviewer; CI

## Decision

- Every feature or behaviour change adds automated tests:
  - backend tests at the layer that can see the rule: Domain, Feature or API tests (CLA-0070)
  - architecture tests when boundaries change
  - a Playwright end-to-end test when the UI changes
  - a Vitest unit test when store or helper logic in the frontend changes (CLA-0065)
- Run the tests before you report the work as done.
- Report a test that cannot be added or run. Never skip it silently.

## Consequences

- "Done" includes the tests and their results.
