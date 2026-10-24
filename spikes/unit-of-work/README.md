# Unit-of-work spike

This proves [CLA-0007](../../adr/0007-persistence-owns-ef-core.md): each module owns a schema in one PostgreSQL database, and a composition module can commit several modules' work in one transaction.

| Project | Role |
|---|---|
| `Spike.Persistence.Interfaces` | `IUnitOfWork`, with no EF Core or Npgsql types |
| `Spike.Persistence` | The shared infrastructure: the data source, one connection per DI scope (`DbSession`), `UnitOfWork`, `UseModuleSchema` and the interceptor that enlists saves in the current transaction |
| `Spike.Modules.Orders.Persistence`, `Spike.Modules.Billing.Persistence` | Two modules, each with its own DbContext, schema, migrations, migrations history table and store. Billing also has a queue table, which acts as the outbox. |
| `Spike.Tests` | Testcontainers tests against real PostgreSQL |

Run it (Docker must be running):

```bash
dotnet test spikes/unit-of-work/UnitOfWorkSpike.slnx
```

The tests were checked against broken wiring. Without the interceptor, the multi-statement save test fails. With one connection per context, every test that relies on a shared transaction fails.
