# CLA-0007: EF Core and PostgreSQL, owned by the Persistence project

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** architecture tests

## Decision

- Data lives in PostgreSQL, accessed through EF Core and Npgsql.
- `<Root>.Persistence` owns the DbContext, the mappings and the migrations. Other projects use the store contracts in `<Root>.Persistence.Interfaces`.
- Schema changes are EF Core migrations:
  `dotnet ef migrations add <Name> --project backend/<Root>.Persistence --startup-project backend/<Root>.Api.Host`

## Consequences

- Queries are verified against real PostgreSQL (CLA-0018), because fakes have hidden EF Core translation bugs before.
