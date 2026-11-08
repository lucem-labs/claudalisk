---
name: add-module
description: Adds a module to a claudalisk app's backend. Creates the implementation, Interfaces, Domain, Persistence, Persistence.Interfaces and Tests projects with a starter aggregate, two features and a baseline migration in the module's own schema, then registers the module in the Host and the solution. Use when a new bounded context needs a module.
argument-hint: "<ModuleName> <AggregateName> [PluralName]"
user-invocable: true
---

# Add a module

Run this from the app's root. Read `skills/backend-architecture` first if the ADRs below are new to you. The app's `AGENTS.md` wins where it lists a deviation (CLA-0028).

## 1. Choose the names

- The module is a bounded context named by a singular noun (CLA-0001), such as `Ordering`.
- The aggregate is the module's first aggregate root (CLA-0048), such as `Order`. It must differ from the module's name, because a type named like its module's namespace does not resolve.
- Pass `--plural` when adding `s` is wrong, such as `--plural HistoryEntries`. The plural names the table, the route and the `Shared` folder.

## 2. Generate it

```
node "${CLAUDE_PLUGIN_ROOT}/tools/scaffold.mjs" add-module . --module <Name> --aggregate <Aggregate> [--plural <Plural>]
```

It creates, in `backend/`:

| Project | Holds |
|---|---|
| `<Root>.Modules.<Name>` | The module class and one folder per feature with its controller, DTOs, handler, validator and mapping (CLA-0005, CLA-0047). Response DTOs used by several features are in `Shared/<Plural>/` |
| `.Interfaces` | Only messages and the module marker (CLA-0067) |
| `.Domain` | The aggregate (CLA-0048) |
| `.Persistence`, `.Persistence.Interfaces` | The DbContext in the module's own schema, the store and its contract, and one baseline migration (CLA-0007, CLA-0051) |
| `.Tests` | Domain, Feature and API tests in folders that mirror the features (CLA-0064, CLA-0070) |

It adds the module to `<Root>.Api/AppModules.cs`, the Host's project references and `<Root>.slnx`. The architecture tests find the module by its name, so they need no change (CLA-0006).

## 3. Make it yours

- Replace the starter `Create<Aggregate>` and `Get<Aggregate>` features and the `Name` field with the module's real ones. Keep at least one aggregate, feature and validator in the app, because a rule whose scan finds nothing fails (CLA-0006).
- Write the module's description in its `<Name>Module` class. It becomes the OpenAPI tag's description (CLA-0046).
- A module that calls another adds that module's marker to its `Dependencies` and references only its `.Interfaces` project (CLA-0002, CLA-0004).
- The baseline migration is yours until it reaches `origin/main` or a pull request opens. After that it never changes (CLA-0010). Use the `add-migration` skill for later changes.

## 4. Check it

```
dotnet test backend/<Root>.slnx
```

The tests start PostgreSQL through Testcontainers, so Docker must be running (CLA-0018).
