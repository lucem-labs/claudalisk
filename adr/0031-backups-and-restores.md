# CLA-0031: Uat backups are versioned; restores are verified and swapped in

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** environments
- **Enforced by:** backup library and its tests; guardrail hook (no uat restore by the agent)
- **Issue:** #14

## Decision

- **What's backed up.** Only uat is backed up. Backups go to a directory outside the repository, with retention by count.
- **Backup contents.** Each backup is a folder holding:
  - a `pg_dump -Fc` dump of the app's database, with every module's schema in one consistent snapshot (CLA-0007), plus one per separate database if a module has moved out;
  - a `manifest.json`, written last, with the checksums, the deployed commit and the applied migrations.

  A folder without a manifest is incomplete: it is ignored and never pruned.
- **When backups are taken:**
  - CD backs up uat before every uat deploy, except the first deploy to an empty database (CLA-0030);
  - the owner can also take one by hand;
  - the agent may take a read-only one, for example to refresh dev (CLA-0032).
- **Restores.**
  - A restore verifies the checksums, restores into a temporary database and swaps it in by rename. `pg_restore --clean` alone leaves extra tables behind.
  - Restoring uat first backs up uat's current data.
  - **Who restores uat:** CD, automatically, when a deploy must undo another pull request's migrations (CLA-0030); otherwise only the owner. The agent never restores uat.
- **Deleting backups** is the owner's decision.

## Consequences

- A failed restore leaves the database unchanged.
- Every uat change can be undone, at the cost of data entered after the backup.
