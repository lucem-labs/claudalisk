# CLA-0007: Each module owns its schema; cross-module work uses a unit of work or the queue

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** architecture tests (EF Core only in persistence projects; entities map to their own context's schema; no foreign keys across schemas); the persistence package's tests; reviewer

## Context

A module owns its data, so that its tables can change, or even move to another database, without changes to other modules (CLA-0001).

Rejected: a physical database per module. It makes ownership strict but rules out atomic work across modules. .NET supports distributed transactions only on Windows, the apps run in Linux containers, and two-phase commit in PostgreSQL is an operational burden. Every cross-module change would need outbox and inbox tables, idempotent handlers and compensation, even in a single-process app that one owner runs.

A schema per module in one physical database keeps the ownership and keeps atomic transactions. A spike proved the wiring below with tests that fail when it breaks, and the persistence package's tests cover the same cases.

## Decision

- **One database, one schema per module.** Data lives in PostgreSQL, through EF Core and Npgsql, in one physical database per environment. Each module owns a schema named after it (CLA-0051). Its `<Root>.Modules.<Name>.Persistence` project holds:
  - the module's DbContext, with `HasDefaultSchema("<name>")`;
  - its migrations, with the migrations history table in its own schema;
  - its stores, which map EF Core entities to aggregates or read models (CLA-0048).

  The store contracts live in `<Root>.Modules.<Name>.Persistence.Interfaces`, which only the module uses.
- **Nothing crosses a schema.** No module reads or writes another module's tables: no joins, no views and no foreign keys across schemas. Modules refer to other modules' data by id and get it through contracts (CLA-0002). The jobs library's two exceptions are in CLA-0060 and CLA-0068.
- **The claudalisk persistence package is the shared infrastructure** (CLA-0062). It holds no module's data. It provides the app's single `NpgsqlDataSource`, one connection per DI scope that every module DbContext in that scope shares, and the unit of work. `IUnitOfWork` comes from a separate abstractions package with no EF Core or Npgsql types.
- **Atomic work across modules uses the unit of work.**
  - A composition module coordinates other modules' contracts inside `IUnitOfWork.RunAsync`. Everything the participating modules save in that call commits or rolls back together.
  - Only composition modules open a unit of work around calls to other modules. A module may also use one around several saves of its own.
  - A nested call joins the outer unit of work.
  - Inside it, modules save but never commit, start their own transactions or swallow exceptions.
- **Module DbContexts register through `UseModuleSchema(sp, "<name>")`.** It uses the scope's connection, puts the history table in the module's schema, and points every save at the current transaction.
  - No `AddDbContextPool`, because each context needs its own scope's connection.
  - No `EnableRetryOnFailure`, because EF Core's retries do not work with a transaction you control. The dispatcher retries the whole command instead (CLA-0049, CLA-0056).
- **The dispatcher keeps the unit of work intact** (CLA-0049): it resolves handlers from the caller's scope, never uses singleton handlers, runs one handler at a time and lets exceptions propagate.
- **Work that can happen later is queued, not called.** It goes into the jobs table of the module that will do it, inside the same unit of work. The jobs table is the outbox, and the handler must be idempotent (CLA-0058). Nothing runs on a background thread from the request.
- **A module that moves to its own database** (CLA-0001) gets its own data source and leaves the unit of work. Its callers switch to queued work, with an outbox on their side and an inbox of handled message ids on the module's. The architecture test flags any unit of work that still includes it. The module's database joins the app config by role, the migrate step (CLA-0008), the backups (CLA-0031) and the fresh-database test (CLA-0011).

## Consequences

- Modules keep strict data ownership, and cross-module work stays atomic and simple by default.
- One database means one migrate step and one backup that is consistent across modules at a single point in time.
- Moving a module out of the database is a deliberate change: its callers move to queued work.
- The whole app shares one connection role, so database permissions do not enforce schema ownership. Architecture tests and review enforce it.
- Reports that need several modules' data go through their contracts, or through a read model built from them (CLA-0068), never through SQL across schemas.
