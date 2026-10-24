# CLA-0016: Every behaviour change ships with tests

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** testing
- **Enforced by:** reviewer; Stop gate (planned)

## Decision

- Every feature or behaviour change adds automated tests:
  - backend regression tests;
  - architecture tests when boundaries change;
  - a Playwright end-to-end test when the UI changes.
- Tests are run before work is reported as done.
- A test that can't be added or run is reported, never skipped silently.

## Consequences

- "Done" includes the tests and their results.
