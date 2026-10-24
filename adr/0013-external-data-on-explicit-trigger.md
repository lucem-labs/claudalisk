# CLA-0013: External data is refreshed only on an explicit trigger, and never from tests

- **Status:** proposed
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** reviewer; test stubs
- **Issue:** #10

## Decision

- Pulling or backfilling data from a third-party API is an explicit, owner-triggered action: an API endpoint plus a script that asks for confirmation and backs up prod first. It never happens at startup.
- Third-party clients batch requests, respect rate limits and `Retry-After`, and cache results locally.
- Tests and CI never call live third-party APIs. They use recorded responses or a stub server. Only a smoke script, run by hand, calls the live API.

## Consequences

- Tests are deterministic and work offline.
