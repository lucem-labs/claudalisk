# CLA-0012: Data fixes are EF Core migrations

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** add-migration skill, reviewer; guardrail hook (no SQL against uat by hand, CLA-0029)

## Context

In an existing app, data cleanups were first done with SQL by hand. Nobody reviewed them, backed them up first, or tried them on dev. Separate one-off scripts would add a second path for data changes, with its own ordering, tracking and deploy step. Migrations already have all of that. They are reviewed, versioned, run once per database and ordered with the schema changes around them. The deploy step runs them after the pre-deploy backup (CLA-0008).

## Decision

- **Cleanups, backfills and corrections are EF Core migrations**, like schema changes. Put the data change in `Up()` through `migrationBuilder.Sql(...)`. Do not use one-off data scripts or hand-run SQL.
- **Raw SQL only.** A migration never uses the DbContext or entity classes. It is a snapshot of the schema at that point, so write its SQL against the schema as it exists at that step. Code that uses today's model breaks when the model changes.
- **Order the steps inside the migration.** The usual pattern is:
  1. add the column or table as nullable or unconstrained
  2. clean up or backfill
  3. tighten the constraint (`NOT NULL`, unique index, foreign key)

  Bad rows block a constraint, so clean them up first.
- **Transactions.** A migration's SQL runs in the same transaction as the rest of the migration. A statement that cannot run in a transaction, such as PostgreSQL's `CREATE INDEX CONCURRENTLY` or `VACUUM`, uses `migrationBuilder.Sql(..., suppressTransaction: true)`.
- **Large tables.** A big `DELETE` or `UPDATE` can hold locks and hit the command timeout. Batch it, or raise the migration command timeout for that deploy. A fix that takes longer than a deploy should is a design question. File a `needs-design-review` issue (CLA-0022). It never becomes a startup task (CLA-0009).
- **One-way is acceptable.** `Down()` undoes the schema change but cannot bring deleted rows back. When the data matters, the migration first copies the affected rows to a backup table. Otherwise the pre-deploy backup (CLA-0031) is the way back.
- **Safe on an empty database.** The SQL of the fix is a no-op on an empty database, so the fresh-database test (CLA-0011, proposed) still passes.
- **Try it on real data first.** Refresh dev from uat (CLA-0032) and deploy dev, which runs the migration. Check the result before you open the pull request. Real data often shows surprises in cleanup SQL.
- **Not migrations:** changes that need C# logic or calls to other services. They become an explicit, owner-triggered action (like the proposed CLA-0013), with their own design issue.

## Consequences

- Every data change in uat is reviewed, versioned and recorded in the migration history. It runs after a backup.
- Data-fix migrations are immutable once applied, like any other migration (CLA-0010).
