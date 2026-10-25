# CLA-0011: A fresh, empty database migrates end to end

- **Status:** proposed
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** generated test, run by the add-migration skill
- **Issue:** #7

## Context

Throwaway test stacks and CI start from an empty database. A migration that works only on a database with history breaks all of them, and test workarounds can hide the problem.

## Decision

- A test migrates a fresh, empty PostgreSQL database to every module's latest migration DbContext, then down and up again.
- Test fixtures never patch the schema to work around a migration.

## Consequences

- Every new migration is checked on an empty database before it merges.
