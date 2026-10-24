# CLA-0032: Dev is refreshed one way from prod

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** environments
- **Enforced by:** refresh script (it can only write dev)

## Decision

- When work needs real data, dev is restored from the latest prod backup (or from a fresh, read-only prod backup).
- Data never flows from dev to prod.
- After the restore, dev is migrated. Dev code can be ahead of prod's schema, and the API refuses to start with pending migrations (CLA-0008).

## Consequences

- Dev can be verified against realistic data without risking prod.
