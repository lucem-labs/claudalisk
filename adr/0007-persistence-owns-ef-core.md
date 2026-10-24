# CLA-0007: EF Core and PostgreSQL, owned by persistence projects; a module may own its database

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** architecture tests (only persistence projects use EF Core; no project touches another's DbContext), reviewer

## Context

CLA-0001 makes a module's contract its boundary, so a module may move to its own database without its callers noticing. Persistence needs one default that keeps simple apps simple, and a clear shape for the modules that own their data.

## Decision

- **Technology.** Data lives in PostgreSQL, accessed through EF Core and Npgsql.
- **Default: one shared database.** `<Root>.Persistence` owns the shared DbContext, its mappings and its migrations. Modules use the store contracts in `<Root>.Persistence.Interfaces` and never see EF Core types.
- **A module may own its database.** It then has its own `<Root>.Modules.<Name>.Persistence` project, with its own DbContext, migrations and connection string, and its own `*.Persistence.Interfaces` store contracts used only inside the module.
  - Nothing outside the module reads or writes its tables.
  - Other modules get its data only through its public contract (CLA-0002).
  - There are no joins or transactions across databases. Consistency across modules comes from the contract, for example queued work (CLA-0001) and idempotent handlers.
- **Migrations.** Schema changes are EF Core migrations, one migration history per DbContext:
  `dotnet ef migrations add <Name> --project backend/<PersistenceProject> --startup-project backend/<Root>.Api.Host`
- **Every database is first-class in operations:**
  - it is listed by role in the app config (#8);
  - it is migrated in the deploy step (CLA-0008);
  - it is backed up and restored together with the others (CLA-0031);
  - it is covered by the fresh-database test (CLA-0011).

## Consequences

- Moving a module to its own database is a data migration plus a new persistence project. Callers don't change.
- Reporting that needs data from several modules goes through their contracts, or a read model built from them, not cross-database SQL.
- Queries are verified against real PostgreSQL (CLA-0018), because fakes have hidden EF Core translation bugs before.
