---
name: data-and-migrations
description: Claudalisk data decisions (ADRs). Covers EF Core and PostgreSQL ownership, migrations as an explicit deploy step, no data changes at startup, immutable applied migrations, fresh-database migration tests, data fixes as migrations, external data refreshes, and database naming. Use when adding or changing migrations, the DbContext, store contracts, seed or default data, or cleaning up or backfilling data in a claudalisk app.
paths:
  - "**/Migrations/**"
  - "**/*Persistence*/**"
user-invocable: false
---

# Data and migrations

These are claudalisk's decisions for schema and data. The app's `AGENTS.md` wins where it lists a deviation (CLA-0028). Before changing code that one of these decisions covers, read the ADR.

- [CLA-0007](${CLAUDE_PLUGIN_ROOT}/adr/0007-persistence-owns-ef-core.md) (accepted): each module owns a schema in one database, with its own DbContext, migrations and store contracts, and nothing crosses schemas. Atomic cross-module work uses a composition module's `IUnitOfWork`, and later work uses the owning module's queue.
- [CLA-0008](${CLAUDE_PLUGIN_ROOT}/adr/0008-migrations-are-a-deploy-step.md) (accepted): migrations run as an explicit deploy step, and the API refuses to start with pending migrations.
- [CLA-0009](${CLAUDE_PLUGIN_ROOT}/adr/0009-no-data-changes-at-startup.md) (accepted): no seeding or other data changes at startup. Default rows come from idempotent migrations.
- [CLA-0010](${CLAUDE_PLUGIN_ROOT}/adr/0010-applied-migrations-are-immutable.md) (accepted): never edit a migration once uat applied it (its pull request is open) or it is on `origin/main`. A hook, the uat deploy and check-migrations (CI wiring in #18) refuse it. Fix forward; the owner approves exceptions by hash.
- [CLA-0011](${CLAUDE_PLUGIN_ROOT}/adr/0011-fresh-database-migrates.md) (accepted): the generated `FreshDatabaseMigrates` test migrates a fresh, empty database end to end, then down and up again.
- [CLA-0012](${CLAUDE_PLUGIN_ROOT}/adr/0012-one-off-data-fixes.md) (accepted): cleanups and backfills are raw-SQL EF Core migrations on their own module's schema, never the DbContext. A read model another module feeds is seeded by a rebuild job, and each is tried on dev with uat data first.
- [CLA-0013](${CLAUDE_PLUGIN_ROOT}/adr/0013-external-data-on-explicit-trigger.md) (accepted): third-party data is refreshed only on an explicit owner trigger, and never from tests.
- [CLA-0031](${CLAUDE_PLUGIN_ROOT}/adr/0031-backups-and-restores.md) (accepted): Uat backups are versioned; restores are verified and swapped in.
- [CLA-0051](${CLAUDE_PLUGIN_ROOT}/adr/0051-database-naming.md) (accepted): identifiers are unquoted snake_case through `UseSnakeCaseNamingConvention()`. Use plural tables, `id` and `<thing>_id` keys, `_timestamp` and `_date` columns, `is_` and `has_` booleans, and no name over 63 bytes.
- [CLA-0056](${CLAUDE_PLUGIN_ROOT}/adr/0056-version-column-for-optimistic-concurrency.md) (accepted): every aggregate root table has a `bigint` `version` column, the concurrency token and the ETag. Writes that depend on what the client read need `If-Match`: a stale one gets `412`, a lost race retries and then fails with `409`.
