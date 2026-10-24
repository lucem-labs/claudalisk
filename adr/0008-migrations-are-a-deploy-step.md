# CLA-0008: Migrations are an explicit deploy step

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** pending-migrations guard and its tests; deploy script order

## Context

Migrating at startup mutates prod on every restart and races the pre-deploy backup.

## Decision

- The Host has an `--initialize-databases` mode that applies migrations and exits.
- Deploys run that mode as a separate step: a `migrate` Compose service using the same image, after the pre-deploy backup and before the new API starts.
- Otherwise, the API refuses to start while migrations are pending.
- `Migrate`, `MigrateAsync` and `EnsureCreated` are not called anywhere else.

## Consequences

- A failed migration stops the deploy with the old API still running.
