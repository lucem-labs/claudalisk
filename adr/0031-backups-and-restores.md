# CLA-0031: Uat backups are versioned; restores are verified and swapped in

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** environments
- **Enforced by:** `@claudalisk/scripts` and its tests (CLA-0084); guardrail hook (no uat restore by the agent)
- **Issue:** #14, #86, #273, #292

## Decision

- **What is backed up.** Only uat. Backups go to a directory outside the repository, and only the current and the previous one are kept.
- **Backup contents.** Each backup is a folder that holds:
  - a `pg_dump -Fc` dump of the app's database, with every module's schema in one consistent snapshot (CLA-0007), plus one dump per separate database if a module has moved out
  - a `manifest.json`, written last, with the checksums, the reason for the backup, the databases, the deployed commit, the app's version (CLA-0099) and the applied migrations. The commit and the version are read from the API container, running or not, or from its image, so a backup works while the API is down

  The folder is named `<UTC timestamp>-<sha7>`, with `unknown` when the commit cannot be read. A folder without a manifest is incomplete. Tools ignore it and never prune it.
- **Every backup prunes after itself.** Once its manifest is written, a backup deletes every complete backup except:
  - itself and the one before it;
  - the newest backup taken before any migration that uat has applied but `main` does not have yet, including one in a schema `main` does not migrate at all (CLA-0030 ignores such a schema for the deploy check, because the commit may retire it; pruning must not). A migration that a Claudalisk package ships, as the scheduler does for its `scheduling` schema, is not in the repository, so `main` can never have it and it keeps no restore point;
  - the backup a uat restore is about to restore.

  There is no separate prune command and no setting for the count. When `origin/main` cannot be read, the backup deletes nothing and says so.
- **When backups are taken:**
  - The review deploy backs up uat before every uat deploy, except the first deploy to an empty database (CLA-0030).
  - The owner can also take one by hand.
  - The agent may take a read-only one, for example to refresh dev (CLA-0032).
- **Restores.**
  - A restore verifies the checksums, restores into a temporary database and swaps it in by rename. `pg_restore --clean` alone leaves extra tables behind.
  - Restoring uat backs up the current uat data after stopping the API, so the backup is consistent.
  - **Order:** a restore first reads the deployed version and refuses, changing nothing, when it is unreadable. It then stops the API (a failed stop aborts), backs up uat, swaps the database in, migrates it with the deployed image's `migrate` service (CLA-0008), and only then starts the API. If the backup or the first swap fails, nothing changed and the API starts again. If a later swap or the migration fails, the restore says so and leaves the API stopped. `--no-start` skips the migration and the start.
  - The API's restart policy does not loop on pending migrations: an API that refuses to start because migrations are pending stays stopped.
  - **Who restores uat:** only the owner. The agent never restores uat. When a deploy finds migrations the commit lacks, it refuses and prints the owner's restore command (CLA-0030).
- **Deleting backups** is done only by that pruning, under the rule the owner set. Nobody deletes a backup by hand, and a backup the agent takes prunes the same way.

## Consequences

- A failed restore leaves the database unchanged.
- A restored backup older than the deployed commit is brought up to that commit's schema before anyone uses it, and a backup the deployed image can't migrate never serves traffic.
- Every uat change can be undone, at the cost of data entered after the backup.
- uat can go back two backups at most, or to the point before a migration that has not merged. Older states are gone, which bounds the disk the backups use.
