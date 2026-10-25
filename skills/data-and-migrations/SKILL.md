---
name: data-and-migrations
description: Claudalisk data decisions (ADRs) - EF Core and PostgreSQL ownership, migrations as an explicit deploy step, no data changes at startup, immutable applied migrations, fresh-database migration tests, data fixes as migrations, external data refreshes, and database naming. Use when adding or changing migrations, the DbContext, store contracts, seed or default data, or cleaning up or backfilling data in a claudalisk app.
paths:
  - "**/Migrations/**"
  - "**/*Persistence*/**"
user-invocable: false
---

# Data and migrations

These are claudalisk's decisions for schema and data. The app's own `AGENTS.md` wins where it lists a deviation (CLA-0028). Before changing code that one of these decisions covers, read the ADR.

- [CLA-0007](${CLAUDE_PLUGIN_ROOT}/adr/0007-persistence-owns-ef-core.md) (accepted): each module owns a schema in one database, with its own DbContext, migrations and store contracts, and nothing crosses schemas; atomic cross-module work goes through a composition module's `IUnitOfWork`, later work through the owning module's queue.
- [CLA-0008](${CLAUDE_PLUGIN_ROOT}/adr/0008-migrations-are-a-deploy-step.md) (accepted): migrations run as an explicit deploy step; the API refuses to start with pending migrations.
- [CLA-0009](${CLAUDE_PLUGIN_ROOT}/adr/0009-no-data-changes-at-startup.md) (accepted): no seeding or other data changes at startup; default rows come from idempotent migrations.
- [CLA-0010](${CLAUDE_PLUGIN_ROOT}/adr/0010-applied-migrations-are-immutable.md) (accepted): a migration tracked on `origin/main` is never edited; fix forward.
- [CLA-0011](${CLAUDE_PLUGIN_ROOT}/adr/0011-fresh-database-migrates.md) (proposed): a test migrates a fresh, empty database end to end, then down and up again.
- [CLA-0012](${CLAUDE_PLUGIN_ROOT}/adr/0012-one-off-data-fixes.md) (accepted): cleanups and backfills are EF Core migrations using raw SQL (never the DbContext), ordered between schema steps and tried on dev with uat data first.
- [CLA-0013](${CLAUDE_PLUGIN_ROOT}/adr/0013-external-data-on-explicit-trigger.md) (proposed): third-party data is refreshed only on an explicit owner trigger, and never from tests.
- [CLA-0031](${CLAUDE_PLUGIN_ROOT}/adr/0031-backups-and-restores.md) (accepted): uat backups are versioned with a manifest written last; restores are verified and swapped in, and only CD or the owner restores uat.
- [CLA-0051](${CLAUDE_PLUGIN_ROOT}/adr/0051-database-naming.md) (proposed): identifiers are unquoted snake_case through `UseSnakeCaseNamingConvention()`; plural tables, `id` and `<thing>_id` keys, `_timestamp` and `_date` columns, `is_` and `has_` booleans, and no name over 63 bytes.
