# CLA-0031: Prod backups are versioned; restores are verified and swapped in

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** environments
- **Enforced by:** backup library and its tests; guardrail hook
- **Issue:** #14

## Decision

- Only prod is backed up. Backups go to a directory outside the repository, with retention by count.
- Each backup is a folder holding:
  - a `pg_dump -Fc` dump of the app's database, with every module's schema in one consistent snapshot (CLA-0007), plus one per separate database if a module has moved out;
  - a `manifest.json`, written last, with the checksums, the deployed commit and the latest migrations.
- A folder without a manifest is incomplete. It is ignored and never pruned.
- A restore verifies the checksums, restores into a temporary database and swaps it in by rename. `pg_restore --clean` alone leaves extra tables behind.
- Restoring prod first backs up prod's current data, and needs the owner's approval naming the backup.
- Deleting backups is the owner's decision.

## Consequences

- A failed restore leaves the database unchanged.
