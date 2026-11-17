# CLA-0011: A fresh, empty database migrates end to end

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** the template's `FreshDatabaseMigrates` test in `<Root>.Api.Tests`, run by the add-migration skill
- **Issue:** #7

## Context

Throwaway test stacks and CI start from an empty database. A migration that works only on a database with history breaks all of them, and test workarounds can hide the problem.

## Decision

- A test named `FreshDatabaseMigrates` migrates a fresh, empty PostgreSQL database to every module's latest migration, then down, and up again.
- The add-migration skill runs it for every new migration.
- Test fixtures never patch the schema to work around a migration.

## Consequences

- Every new migration is checked on an empty database before it merges.
