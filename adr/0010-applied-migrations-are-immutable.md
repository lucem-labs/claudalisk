# CLA-0010: Applied migrations are never edited

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** guardrail hook (deny edits); CI check (proposed in #7)
- **Issue:** #7

## Decision

- A migration that has run anywhere is never edited, renamed or removed. Mistakes are fixed forward with a new migration.
- "Has run" is decided from git: the migration file is tracked on `origin/main`. The model snapshot is always editable.
- Rare exceptions need the owner's approval. They are listed in an `approved-migration-edits.txt` file that only the owner edits (proposed in #7).

## Context for the exception

An existing app renamed a table in a migration but kept the old primary-key index name. Prod worked only because of a manual fix, while every fresh database failed. The correct fix was an owner-approved edit of the applied migration.

## Consequences

- `dotnet ef migrations remove` on an applied migration is refused.
