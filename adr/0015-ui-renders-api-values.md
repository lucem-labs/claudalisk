# CLA-0015: The UI renders what the API returns and never duplicates backend rules

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** frontend
- **Enforced by:** reviewer

## Decision

- Components display values that the backend computes. They do not recompute totals, availability, validation or other business rules.
- When the UI needs a derived value, the API provides it.
- The backend sanitises and validates on every write. The frontend never relies on its own checks for correctness.

## Consequences

- A rule lives in one place, the backend, and is tested there.
