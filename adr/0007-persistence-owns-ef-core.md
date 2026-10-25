# CLA-0007: Each module owns its schema; cross-module work uses a unit of work or the queue

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** architecture tests (EF Core only in persistence projects; entities map to their own context's schema; no foreign keys across schemas), reviewer; proven by `spikes/unit-of-work`

## Context

A module owns its data, so that its tables can change, or even move to another database, without touching other modules (CLA-0001).

Separate physical databases per module make that ownership strict, but they rule out atomic work across modules. .NET supports distributed transactions only on Windows, and the apps run in Linux containers. Two-phase commit in PostgreSQL is an operational burden. Every cross-module change would become eventually consistent, with outbox and inbox tables, idempotent handlers and compensation, even in a single-process app run by one owner.

A **schema per module in one physical database** keeps the ownership and keeps atomic transactions available. Each module has its own tables, migrations and migration history. Because all modules share one database, a composition module can still commit work from several modules in one transaction.

## Decision

### One database, one schema per module

- Data lives in PostgreSQL, accessed through EF Core and Npgsql. Each app has **one physical database** per environment.
- Each module owns a **schema** named after it. Its `<Root>.Modules.<Name>.Persistence` project holds:
  - the module's DbContext, with `HasDefaultSchema("<name>")`;
  - its migrations, with the migrations history table in its own schema;
  - its stores, which map EF Core entities to messages (CLA-0003), or to the module's aggregates under the proposed CLA-0048.

  The store contracts live in `<Root>.Modules.<Name>.Persistence.Interfaces` and are used only inside the module.
- **Nothing crosses a schema.** No module reads or writes another module's tables: no joins, no views and no foreign keys across schemas. Modules refer to each other's data by ID and get it through contracts (CLA-0002). Migration SQL qualifies table names with the schema (CLA-0012).
- **`<Root>.Persistence` is shared infrastructure** and holds no module's data. It contains:
  - the app's single `NpgsqlDataSource`;
  - one connection per DI scope (a request or a background job), which every module DbContext in that scope shares;
  - the unit of work.

  Module persistence projects reference it, like `<Root>.Shared` (CLA-0002). `IUnitOfWork` lives in `<Root>.Persistence.Interfaces`, which has no EF Core or Npgsql types.

### Atomic work across modules: the unit of work

- A **composition module**, meaning a module whose service coordinates other modules' contracts, runs that work inside `IUnitOfWork.RunAsync`. Everything the participating modules save in that call commits together or rolls back together.
- **Only composition modules open a unit of work around other modules' calls.** A module may also use one around its own several saves. A nested call joins the outer unit of work; it doesn't start a new transaction.
- **Inside a unit of work, modules save but never commit.** They don't start their own transactions or swallow exceptions, so any failure rolls everything back.
- **How it's wired.** Module DbContexts are registered through `UseModuleSchema(sp, "<name>")`, which:
  - uses the scope's shared connection;
  - puts the migrations history table in the module's schema;
  - adds an interceptor that points every save at the current unit of work's transaction.

  Without that interceptor, a save that sends several statements would try to start its own transaction.
- **Things that break the shared connection.** Don't use `AddDbContextPool`, because each context needs its own scope's connection. Don't use `EnableRetryOnFailure` on module contexts, because EF Core's retries don't work with a transaction you control. Retry the whole `RunAsync` call instead.

### Dispatching between modules

Modules may call each other through an in-process dispatcher: claudalisk's own mediator-style package, which is still to be built. Whatever form it takes, it must keep the unit of work intact:

- **Same scope.** Handlers are resolved from the caller's DI scope, never from the root provider or a new scope. A handler in another scope gets another connection and commits on its own, outside the unit of work.
- **Scoped or transient handlers.** Handlers are never singletons, which would capture a scoped DbContext. The service provider validates scopes at startup.
- **One handler at a time.** Notification handlers run sequentially. Running them in parallel on the shared connection fails, because neither a DbContext nor a connection can run two operations at once.
- **A pipeline step may own the unit of work.** A step can wrap composition commands in `IUnitOfWork.RunAsync`. Requests those handlers send in turn join the same unit of work.
- **Exceptions propagate.** The dispatcher and its handlers don't catch and swallow exceptions, so a failure reaches the unit of work and rolls everything back.
- **No fire-and-forget.** Work dispatched to run later is queued in the owning module's queue table inside the unit of work. It never runs on a background thread from the request.

### Asynchronous work and separated modules: the queue as outbox

- Work that may happen later is **queued, not called**: in the queue table of the module that will do it, inside the same unit of work. The queue row commits or rolls back with the data, so the queue is the outbox, with no separate outbox table. The handler must be idempotent.
- A module that **moves to its own database** (CLA-0001) gets its own data source and leaves the unit of work. Its callers switch to queued work: an outbox in the caller's schema, delivered to the module, with an inbox on the module's side that records handled message IDs. The architecture test flags any unit of work that still includes such a module.

### Operations

- One database means one migrate step, which migrates every module's DbContext (CLA-0008). It also means one backup and restore unit, which is consistent across modules at a single point in time (CLA-0031). The fresh-database test migrates every module's DbContext (CLA-0011).
- A module that moves to its own database adds that database to the app config by role (#8), to the migrate step, to the backups and to the fresh-database test.

## Proof

`spikes/unit-of-work` has two module persistence projects, each with its own schema and migrations, plus the shared persistence infrastructure. Its Testcontainers tests show that:

- work from two modules commits together;
- a database error in the second module, or an exception after both saves, rolls back both;
- a nested unit of work joins the outer one;
- a context used before the unit of work began still joins it;
- a save that sends several statements joins instead of starting its own transaction;
- contexts don't keep a finished transaction;
- queued work commits and rolls back with the data;
- another scope can't see uncommitted work;
- without a unit of work, each module commits on its own;
- each schema has its own migrations history.

Each test was checked to fail when the wiring is broken: without the interceptor, or with one connection per context. CI runs the tests on every push.

The dispatching rules were checked with temporary tests that routed calls through MediatR 12.5 on the same spike. Those tests weren't kept, because claudalisk will build its own dispatcher. They showed that:

- requests sent to two modules inside a unit of work roll back together;
- a pipeline step that owns the unit of work rolls back the nested requests;
- notification handlers run inside the unit of work;
- a handler resolved in a new scope committed on its own;
- publishing in parallel failed with "A second operation was started on this context instance".

The dispatcher's own tests must cover the same cases.

## Consequences

- Modules keep strict data ownership, and cross-module work stays atomic and simple by default.
- Every module in a unit of work must live in the app's one database. Moving a module out is a deliberate change: its callers move to queued work.
- Because the whole app shares one connection role, schema ownership isn't enforced by database permissions. Architecture tests and review enforce it instead.
- Reports that need data from several modules go through their contracts, or through a read model built from them. They never use SQL across schemas.
