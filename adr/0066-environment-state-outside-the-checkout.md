# CLA-0066: Environment files and backups live outside the checkout, per app and machine

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** environments
- **Enforced by:** the environment scripts; guardrail hook (no env files in the checkout)
- **Issue:** #15, #86, #124

## Context

Env files and deployment records were untracked files in the checkout. A worktree for an issue did not have them. Scripts that then fall back to the committed example file let the environment with real data run with an example password.

A deploy that writes a missing env file with a new password breaks the database whose volume already has one, and on uat the owner, not a deploy, creates the volume (CLA-0029).

## Decision

- **Environment state lives in `~/.claudalisk/apps/<app>/`** on the machine:
  - `dev.env` and `uat.env`: the environment variables and secrets;
  - `backups/`: the uat backups (CLA-0031);
  - `verify/`: the logs of failed CI jobs that `verify.mjs` saves, one folder per worktree (CLA-0076).
  - Any other per-app state that a claudalisk script or hook keeps goes in its own subfolder here, named after it.
  - The machine-wide registry `~/.claudalisk/apps.json` sits next to the per-app folders (CLA-0082).
- **The checkout holds no env files.** It holds only `.env.*.example` files with placeholders that cannot work (CLA-0026).
- **Who reads it:** the environment scripts (`@claudalisk/scripts`, CLA-0084), run by the agent on the machine: dev deploys, uat review deploys (CLA-0030), backups and refreshes.
- **An init script creates each environment.** The app's init script (`node scripts/init.mjs --environment <env>`) generates the database password and writes it into every variable of `<env>.env` that needs it, such as `POSTGRES_PASSWORD` and the connection string, so the file is complete when it is written. It then creates the data volume with that password.
  - The owner runs it for uat (CLA-0029). The first dev deploy runs it for dev.
  - It refuses when the env file or the volume already exists, so it never invents a password for a volume that has one.
- **No deploy writes an env file.** A deploy refuses when the env file or the volume exists without the other, and uat never falls back to an example file. dev's volume is disposable, so a dev deploy that finds a volume without `dev.env` removes the volume and runs the init script.
- Deployment records are GitHub deployments, not local files (CLA-0030).
- An issue's worktree is removed after the owner merges its pull request.

## Consequences

- Worktrees need no copied files.
- Apps on one machine cannot collide, because each has its own folder.
- A password is generated once, by the init script, and never typed or copied into a file by hand.
- Moving an app to another machine means copying its folder in `~/.claudalisk/apps/`.
