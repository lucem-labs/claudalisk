# CLA-0032: Dev is refreshed one way from uat

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** environments
- **Enforced by:** refresh script (it can only write dev)

## Decision

- When work needs real data, restore dev from the latest uat backup, or from a fresh, read-only uat backup.
- Data never flows from dev to uat.
- After the restore, migrate dev. Dev code can be ahead of the uat schema, and the API refuses to start with pending migrations (CLA-0008).

## Consequences

- Dev can be verified against realistic data without risk to uat.
- Data fixes (CLA-0012) are tried on dev with uat data before they reach uat.
