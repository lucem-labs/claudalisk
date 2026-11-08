---
name: add-migration
description: Adds an EF Core migration to a claudalisk app the way its ADRs require. Covers creating it on the module's own Persistence project and DbContext, default rows and data fixes as migrations, never editing an applied migration, the owner-approved exception, and the fresh-database test every new migration runs. Use when a schema change, default row, backfill or cleanup needs a migration.
argument-hint: "<module> <PascalCaseVerbPhrase>"
user-invocable: true
---

# Add a migration

Run this from the app's root. Read `skills/data-and-migrations` first if the ADRs below are new to you. The app's `AGENTS.md` wins where it lists a deviation (CLA-0028).

## 1. Check the migration is allowed

- Never edit, rename or remove a migration that has run (CLA-0010). It has run once its file is tracked on `origin/main`, or once its pull request is open, because the review deploy applies an open pull request's migrations to uat (CLA-0030). Fix a mistake forward with a new migration.
- A migration of your own pull request that has not opened yet has run only on dev. You may edit it, or remove it with `dotnet ef migrations remove`, which asks first.
- A hook denies edits of migrations tracked on `origin/main`, the uat deploy refuses a changed one, and the `scripts/check-migrations.mjs` check fails the branch.
- The model snapshot is always editable.

## 2. Create it

- Use the module's own Persistence project and DbContext (CLA-0007). Nothing crosses schemas.
- Name it with a PascalCase verb phrase that says what it does, such as `AddOrderNotes` (CLA-0051). All identifiers are lowercase `snake_case`, set by the naming convention, and never quoted.

```
dotnet ef migrations add <Name> --project <Module>.Persistence --startup-project <App>.Api --context <Module>DbContext
```

- Default rows are written in idempotent migrations (`INSERT ... ON CONFLICT DO NOTHING`), never at startup (CLA-0009).
- A cleanup or backfill is a raw-SQL migration on the module's own schema, never the DbContext. It is tried on dev with uat data first (CLA-0012).
- Review the generated file and the snapshot diff for changes you did not intend.

## 3. Test it

Migrations are a deploy step (CLA-0008). The API refuses to start with pending migrations and seeds nothing, so a test that starts the API does not apply them. Never patch the schema in a test fixture to work around a migration (CLA-0011).

Run the fresh-database test every time, and with a data fix also the tests of the code that reads the data (CLA-0016):

```
dotnet test --project backend/<Root>.Api.Tests/<Root>.Api.Tests.csproj --filter-method "*FreshDatabaseMigrates"
```

It migrates a fresh, empty PostgreSQL database up end to end, then down, then up again. The test is generated for the app with #17 of claudalisk. Until it exists, report that it was not run.

## 4. Apply and verify on dev

Run `node scripts/migrate.mjs`, then start the API and check the change on dev (CLA-0008). The uat deploy runs the migrations as its own step.

## The owner-approved exception

A defect that no new migration can repair, such as a table renamed with its old primary-key index name kept, may need an edit of the applied migration. Only the owner approves it, by adding a line to `approved-migration-edits.txt` on `main`:

```
<schema>/<migration id> <sha256 of the file with LF endings> <what happened>. #<issue>
```

For example `catalog/20260101000000_RenameTable <64 hex characters> Kept the old primary-key index name. #42`. An entry approves that one content of that one migration, so any later edit needs a new entry. The agent never edits that file.
