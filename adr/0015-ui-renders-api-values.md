# CLA-0015: The UI renders what the API returns and never duplicates backend rules

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** frontend-conventions
- **Enforced by:** reviewer

## Decision

- Components display values computed by the backend. They don't recompute totals, availability, validation or other business rules.
- When the UI needs a derived value, the API provides it.
- Sanitising and validation happen in the backend on every write; the frontend never relies on its own checks for correctness.

## Consequences

- A rule lives in one place, the backend, and is tested there.
