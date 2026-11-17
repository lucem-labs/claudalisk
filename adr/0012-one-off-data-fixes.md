# CLA-0012: Data fixes are EF Core migrations

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** add-migration skill, reviewer; guardrail hook (no SQL against uat by hand, CLA-0029); architecture test (no module code, its migrations included, names another module's schema)
- **Issue:** #80

## Context

Data cleanups done with SQL by hand are not reviewed, backed up first or tried on dev. Separate one-off scripts would add a second path for data changes, with its own ordering, tracking and deploy step. Migrations already have all of that: they are reviewed, versioned, run once per database, ordered with the schema changes around them, and run after the pre-deploy backup (CLA-0008).

The Host migrates the modules in a fixed order. A database restored from an old backup migrates every module in one run, so one module's migration can run before another module has moved its tables. A backfill that read another module's tables and skipped when they were missing once left a read model empty, and only a restored uat backup showed it.

## Decision

- **Cleanups, backfills and corrections are EF Core migrations**, like schema changes. There are no one-off data scripts and no hand-run SQL.
- **Raw SQL only.** A migration is a snapshot of the schema at its step, so it never uses the DbContext or entity classes.
- **A migration reads and writes only its own module's schema** (CLA-0007), not even once for a backfill. Migrations that crossed a schema before this rule cannot be edited (CLA-0010). The architecture test lists each as an exception, with the issue that removes it.
- **A read model that another module feeds is seeded by a rebuild job** (CLA-0068).
  - The migration that creates or changes it marks it as not seeded and queues the job in its own module's jobs table, once, by a dedupe key.
  - The job runs after the deploy, once every module has migrated, and reads through a contract. The jobs library holds it until the Host's migration run completes, and the old app still running during the deploy never claims it (lucem-labs/claudalisk-dotnet#14).
  - It is queued work, not a startup write (CLA-0009), so it needs no owner trigger.
- **A backfill whose precondition is missing fails.** A precondition is something an earlier migration of the same module created, such as a table, a column or a seeded row. It is never a row count, because an empty table on a fresh database looks like an emptied one. The SQL raises an error, and never skips silently.
- **A failed migration stops the deploy.** Its transaction rolls back, and the Host stops the run. Modules migrated earlier in the run stay migrated, and the old app keeps running. Rolling uat back means restoring the pre-deploy backup, which only the owner does (CLA-0031).
- **Every fix is safe on an empty database,** so the fresh-database test still passes (CLA-0011), and is tried on dev with uat data before its pull request opens (CLA-0032).
- **Not migrations:** changes that need C# logic or calls to other services. They become an explicit, owner-triggered action (CLA-0013) with their own design issue. A read-model rebuild is the one exception.
- The add-migration skill holds the recipe: step order, preconditions, transactions, large tables and backup tables.

## Consequences

- Every data change in uat is reviewed, versioned and recorded in the migration history, and runs after a backup.
- Data-fix migrations are immutable once applied, like any other migration (CLA-0010).
- A read model fed by another module is seeded the same way whatever order the modules migrate in, including on a database restored from an old backup.
- A backfill that cannot do its work stops the deploy before it leaves wrong data behind.
