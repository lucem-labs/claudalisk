# CLA-0012: Data fixes are EF Core migrations

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** add-migration skill, reviewer; guardrail hook (no SQL against uat by hand, CLA-0029); architecture test (no module code, its migrations included, names another module's schema)
- **Issue:** #80

## Context

Data cleanups done with SQL by hand are not reviewed, backed up first, or tried on dev. Separate one-off scripts would add a second path for data changes, with its own ordering, tracking and deploy step. Migrations already have all of that. They are reviewed, versioned, run once per database and ordered with the schema changes around them. The deploy step runs them after the pre-deploy backup (CLA-0008).

The Host migrates the modules in a fixed order. A database restored from an old backup migrates every module in one run, so when one module's migration runs, another module may not have moved its tables yet. A backfill that read another module's tables and skipped when they were missing once left a read model empty, and only a restored uat backup showed it.

## Decision

- **Cleanups, backfills and corrections are EF Core migrations**, like schema changes. Put the data change in `Up()` through `migrationBuilder.Sql(...)`. Do not use one-off data scripts or hand-run SQL.
- **A migration reads and writes only its own module's schema,** not even once for a backfill (CLA-0007). Migrations that already crossed a schema before this rule cannot be edited (CLA-0010). The architecture test lists each of them as an exception with the issue that removes it, such as a new baseline.
- **A read model that another module feeds is seeded by a rebuild job** (CLA-0068).
  - The migration that creates or changes the read model marks it as not seeded and queues that job in its own module's jobs table, after the migration that creates that table (CLA-0058).
  - It queues the job through the jobs library's migration helper, by a job name that never changes and with a dedupe key, so the job is queued once. `Down()` removes the job by its dedupe key while it is still queued.
  - The job runs after the deploy, once every module has migrated, and reads through a contract. The helper holds the job until the Host's migration run has completed. A completed run releases every held job, including those that an earlier, failed run left held. A worker claims only the job names it has registered, so the old app still running during the deploy never claims it (lucem-labs/claudalisk-dotnet#14). It is queued work that a worker runs, not a startup write (CLA-0009), so it needs no owner trigger.
- **A backfill whose precondition is missing fails.** A precondition is something an earlier migration of the same module created, such as a table, a column or a seeded row. It is never a row count, because an empty table on a fresh database looks like an emptied one. The SQL checks it and raises an error when it is missing, for example `DO $$ BEGIN IF to_regclass('<schema>.<table>') IS NULL THEN RAISE EXCEPTION '...'; END IF; END $$`. It never skips silently.
- **A failed migration stops the deploy.** Its transaction rolls back, and the Host stops the migration run. Modules migrated earlier in that run stay migrated, and the old app keeps running. Rolling uat back means restoring the pre-deploy backup, which only the owner does (CLA-0008, CLA-0031).
- **Raw SQL only.** A migration never uses the DbContext or entity classes. It is a snapshot of the schema at that point, so write its SQL against the schema as it exists at that step. Code that uses today's model breaks when the model changes.
- **Order the steps inside the migration.** The usual pattern is:
  1. add the column or table as nullable or unconstrained
  2. clean up or backfill
  3. tighten the constraint (`NOT NULL`, unique index, foreign key)

  Bad rows block a constraint, so clean them up first.
- **Transactions.** A migration's SQL runs in the same transaction as the rest of the migration. A statement that cannot run in a transaction, such as PostgreSQL's `CREATE INDEX CONCURRENTLY` or `VACUUM`, uses `migrationBuilder.Sql(..., suppressTransaction: true)`.
- **Large tables.** A big `DELETE` or `UPDATE` can hold locks and hit the command timeout. Batch it, or raise the migration command timeout for that deploy. A fix that takes longer than a deploy should is a design question. File a `needs-design-review` issue (CLA-0022). It never becomes a startup task (CLA-0009).
- **One-way is acceptable.** `Down()` undoes the schema change but cannot bring deleted rows back. When the data matters, the migration first copies the affected rows to a backup table. Otherwise the pre-deploy backup (CLA-0031) is the way back.
- **Safe on an empty database.** The SQL of the fix is a no-op on an empty database, apart from queueing a read-model rebuild, so the fresh-database test (CLA-0011) still passes.
- **Try it on real data first.** Refresh dev from uat (CLA-0032) and deploy dev, which runs the migration. Check the result before you open the pull request. Real data often shows surprises in cleanup SQL.
- **Not migrations:** changes that need C# logic or calls to other services. They become an explicit, owner-triggered action (like CLA-0013), with their own design issue. A read-model rebuild is the one exception: its migration queues it.
## Consequences

- Every data change in uat is reviewed, versioned and recorded in the migration history. It runs after a backup.
- Data-fix migrations are immutable once applied, like any other migration (CLA-0010).
- A read model fed by another module is seeded the same way whatever order the modules migrate in, including on a database restored from an old backup.
- A backfill that cannot do its work stops the deploy before it leaves wrong data behind.
