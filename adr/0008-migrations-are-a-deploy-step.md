# CLA-0008: Migrations are an explicit deploy step

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** pending-migrations guard and its tests; deploy script order

## Context

A migration at startup changes uat on every restart and races the pre-deploy backup.

## Decision

- The Host has an `--initialize-databases` mode that applies every module's migrations DbContext and exits (CLA-0007).
- Deploys run that mode as a separate step: a `migrate` Compose service that uses the same image. It runs after the pre-deploy backup and before the new API starts.
- Otherwise, the API refuses to start while migrations are pending.
- The application calls `Migrate`, `MigrateAsync` and `EnsureCreated` nowhere else. Test fixtures migrate their databases through the same initializer code (the proposed CLA-0011 and CLA-0018).

## Consequences

- A failed migration stops the deploy, and the old API keeps running.
