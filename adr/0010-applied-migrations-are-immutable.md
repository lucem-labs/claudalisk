# CLA-0010: Applied migrations are never edited

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** guardrail hook (deny edits); CD (refuses a deploy whose uat-applied migration changed); CI check (planned in #7)
- **Issue:** #7

## Decision

- Never edit, rename or remove a migration that has run anywhere. Fix mistakes forward with a new migration.
- A migration "has run" once CD applied it to uat, or once its file is tracked on `origin/main`. CD applies an open pull request's migrations to uat (CLA-0030), so a migration freezes when its pull request opens. Before that it has run only on dev, and the agent may still edit it. The model snapshot is always editable.
- CD records a hash of each migration it applies to uat. A deploy is refused when an applied migration's file no longer matches its hash, and the message tells the agent to add a new migration instead.
- Rare exceptions need the owner's approval. They are listed in an `approved-migration-edits.txt` file that only the owner edits (planned in #7).

## Context for the exception

A migration can rename a table but keep the old primary-key index name. The environment with real data then works only after a manual fix, and every fresh database fails. The correct fix is an edit of the applied migration, approved by the owner.

## Consequences

- `dotnet ef migrations remove` on an applied migration is refused.
