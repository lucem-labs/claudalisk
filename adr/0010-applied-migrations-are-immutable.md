# CLA-0010: Applied migrations are never edited

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** the migration-guard hook (denies Edit, Write and MultiEdit of a migration tracked on origin/main); the guardrail hook (asks before dotnet ef migrations remove); the uat deploy script (refuses a changed or unbaselined applied migration); the check-migrations command (fails a branch that changes or drops a migration on origin/main; CI wiring in #18)
- **Issue:** #7

## Decision

- Never edit, rename or remove a migration that has run anywhere. Fix mistakes forward with a new migration.
- A migration "has run" once a deploy applied it to uat, or once its file is tracked on `origin/main`. The review deploy applies an open pull request's migrations to uat (CLA-0030), so a migration freezes when its pull request opens. Before that it has run only on dev, and the agent may still edit it. The model snapshot is always editable.
- The uat deploy records a SHA-256 of each migration uat has applied, taken from the migration's source file with LF line endings. A deploy is refused when an applied migration's file no longer matches its hash, and the message tells the agent to add a new migration instead.
- An applied migration with no recorded hash takes its baseline from `origin/main`. When its file is there, main's hash is recorded, and the deploy is refused if the commit's hash differs. When it is not there, because an open pull request applied it before recording existed, the deploy is refused unless the owner passes `--adopt-unrecorded-migrations`, which records the commit's hash.
- Rare exceptions need the owner's approval. They are lines in an `approved-migration-edits.txt` file that only the owner edits, read from `origin/main` and never from the working tree: `<schema>/<migration id> <sha256> <what happened>. #<issue>`, for example `catalog/20260101000000_RenameTable 3f...(64 hex characters) Kept the old primary-key index name. #42`. An entry approves exactly one file content: a changed migration passes only when an entry for its id has the commit's hash. A line that does not match the format approves nothing.
- A CI check fails a branch on which a migration tracked on `origin/main` is changed or missing, unless an entry on main covers its new content. Its message names each migration and points to the fix-forward and approval path.

## Context for the exception

A migration can rename a table but keep the old primary-key index name. The environment with real data then works only after a manual fix, and every fresh database fails. The correct fix is an edit of the applied migration, approved by the owner.

## Consequences

- `dotnet ef migrations remove` asks the owner first, and an applied migration is never removed.
