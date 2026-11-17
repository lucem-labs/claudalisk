# CLA-0010: Applied migrations are never edited

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** data-and-migrations
- **Enforced by:** the migration-guard hook (denies Edit, Write and MultiEdit of a migration tracked on origin/main); the guardrail hook (asks before dotnet ef migrations remove and before a deploy with --adopt-unrecorded-migrations); the uat deploy script (refuses a changed or unbaselined applied migration); the check-migrations command in CI (fails a branch that changes or drops a migration on origin/main)
- **Issue:** #7

## Context

A migration that has run is part of every database's history. Editing it leaves databases that ran the old version differing from fresh ones. Rarely, the only fix is an edit: a migration that renamed a table but kept the old primary-key index name leaves the real data working only after a manual fix, and every fresh database failing.

## Decision

- **Never edit, rename or remove a migration that has run anywhere.** Fix mistakes forward with a new migration.
- **A migration has run** once a deploy applied it to uat, or once its file is tracked on `origin/main`. The review deploy applies an open pull request's migrations to uat (CLA-0030), so a migration freezes when its pull request opens. Before that it has run only on dev, and the agent may still edit it. The model snapshot is always editable.
- **The uat deploy fingerprints every migration uat applied** and refuses a commit whose copy of one differs. Its message tells the agent to add a new migration instead. A migration applied before fingerprints existed takes its baseline from `origin/main`. When it is not there, only the owner adopts it, with `--adopt-unrecorded-migrations`.
- **CI fails a branch that changes or drops a migration on `origin/main`,** judged only on what the branch changed since its merge base, so a branch that is only behind main passes.
- **Rare exceptions need the owner's approval:** a line in `approved-migration-edits.txt` on `origin/main`, which only the owner edits. An entry approves exactly one content of one migration, so any later edit needs a new entry. The add-migration skill gives the format.
- The `@claudalisk/scripts` README describes the fingerprints, the baseline and the check (CLA-0084).

## Known limits

- The migration-guard hook is a speed bump on Edit and Write only. A shell write or a stale local `origin/main` gets past it, and the check-migrations command and the uat deploy are the backstop.
- A baseline taken from main assumes that main's file is what uat applied.

## Consequences

- `dotnet ef migrations remove` asks the owner first, and an applied migration is never removed.
- The agent never adopts unrecorded migrations itself.
