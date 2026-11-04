# CLA-0031: Uat backups are versioned; restores are verified and swapped in

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** environments
- **Enforced by:** backup library and its tests; guardrail hook (no uat restore by the agent)
- **Issue:** #14, #86

## Decision

- **What is backed up.** Only uat. Backups go to a directory outside the repository, with retention by count.
- **Backup contents.** Each backup is a folder that holds:
  - a `pg_dump -Fc` dump of the app's database, with every module's schema in one consistent snapshot (CLA-0007), plus one dump per separate database if a module has moved out
  - a `manifest.json`, written last, with the checksums, the deployed commit and the applied migrations

  A folder without a manifest is incomplete. Tools ignore it and never prune it.
- **Pruning keeps the restore points the owner may need.** Retention by count never deletes the newest backup taken before any migration that uat has applied but `main` does not have yet (CLA-0030).
- **When backups are taken:**
  - The review deploy backs up uat before every uat deploy, except the first deploy to an empty database (CLA-0030).
  - The owner can also take one by hand.
  - The agent may take a read-only one, for example to refresh dev (CLA-0032).
- **Restores.**
  - A restore verifies the checksums, restores into a temporary database and swaps it in by rename. `pg_restore --clean` alone leaves extra tables behind.
  - Restoring uat first backs up the current uat data.
  - **Order:** a restore stops the API, swaps the database in, migrates it with the deployed image's `migrate` service (CLA-0008), and only then starts the API. If the migration fails, the restore says so and leaves the API stopped.
  - The API's restart policy does not loop on pending migrations: an API that refuses to start because migrations are pending stays stopped.
  - **Who restores uat:** only the owner. The agent never restores uat. When a deploy finds migrations the commit lacks, it refuses and prints the owner's restore command (CLA-0030).
- **Deleting backups** is the owner's decision.

## Consequences

- A failed restore leaves the database unchanged.
- A restored backup older than the deployed commit is brought up to that commit's schema before anyone uses it, and a backup the deployed image can't migrate never serves traffic.
- Every uat change can be undone, at the cost of data entered after the backup.
