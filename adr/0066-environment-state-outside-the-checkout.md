# CLA-0066: Environment files and backups live outside the checkout, per app and machine

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** environments
- **Enforced by:** the environment scripts; guardrail hook (no env files in the checkout); CD
- **Issue:** #15

## Context

Env files and deployment records were untracked files in the checkout. A worktree for an issue, and a CD job's fresh checkout, did not have them. One app's scripts then fell back to the committed example file, so the environment with real data could run with an example password.

## Decision

- **Environment state lives in `~/.claudalisk/apps/<app>/`** on the machine:
  - `dev.env` and `uat.env`: the environment variables and secrets;
  - `backups/`: the uat backups (CLA-0031).
- **The checkout holds no env files.** It holds only `.env.*.example` files with placeholders that cannot work (CLA-0026).
- **Who reads it:**
  - the agent's dev deploys and the environment scripts, directly;
  - the deploy runner (CLA-0033), with `~/.claudalisk/apps/` mounted read-only and the `backups/` folders read-write.
- **uat never falls back to an example file.** If `uat.env` is missing, the first uat deploy creates it with a random password. A later deploy without it fails.
- Deployment records are GitHub deployments, not local files (CLA-0030).
- An issue's worktree is removed after the owner merges its pull request.

## Consequences

- Worktrees and CD checkouts need no copied files.
- Apps on one machine cannot collide, because each has its own folder.
- Moving an app to another machine means copying its folder in `~/.claudalisk/apps/`.
