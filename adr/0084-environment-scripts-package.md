# CLA-0084: The environment scripts ship as a pinned npm package, called by thin entries

- **Status:** accepted
- **Date:** 2026-11-05
- **Area:** environments
- **Enforced by:** `packages/scripts` and its tests in CI's `adrs` job; `.github/workflows/release.yml` (CLA-0081); npm trusted publishing and the owner's approval; reviewer (no copied or edited logic in an app's entry scripts)
- **Issue:** #14

## Context

Two apps copied the same deploy, backup and restore scripts. A safety fix made in one copy never reached the other. The guards, the migration checks and the backup logic must exist once and reach every app by a version bump, the way the .NET infrastructure does (CLA-0062).

The plugin cannot own the code outright:
- CI has no plugin installed, yet the scripts' tests and the CI-run scripts run there.
- The owner runs a uat restore by hand in a terminal, where `${CLAUDE_PLUGIN_ROOT}` does not exist and the plugin cache path changes with each version.
- A uat deploy should be reproducible from its commit, and code run from the plugin cache depends on whichever version the machine has installed.
- The deny list and `AGENTS.md` name stable paths such as `node scripts/restore.mjs --environment uat` (CLA-0083).

## Decision

- **The scripts' logic is the npm package `@claudalisk/scripts`**, in `packages/scripts` of this repository. It is public, MIT, ESM and uses only Node's standard library. It holds the guards (CLA-0030), the migration checks (CLA-0010), the backups and restores (CLA-0031), the dev refresh (CLA-0032), the init script (CLA-0066) and the migrate script for a directly launched Host (CLA-0008), each tested with `node:test` over an injected command runner.
- **Each app keeps a thin entry script at the stable path** `scripts/<name>.mjs` (`deploy`, `backup`, `restore`, `prune-backups`, `refresh-dev`, `init`, `migrate`), copied from `templates/app/scripts/`. It only calls `runMain` from `@claudalisk/scripts/cli` with the package's function of the same name. It holds no logic, so a fix never needs an edit in the app.
- **An app pins an exact version** in `package.json`, so the lockfile fixes what a deploy runs. CI installs it with `npm ci`, and the owner runs the same command by hand. A fix reaches an app as a version bump in a normal pull request.
- **Publishing is locked to the release workflow** (CLA-0081). npm's trusted publishing names this repository, `release.yml` and the `production` environment, and npm stages each publish until the owner approves it on npmjs.com. No one publishes from a machine.
- **App values come from `.claude/claudalisk.json`** (CLA-0082): the app name, the host prefix, the repository, the databases (a role and the variable that holds the connection string), the dev ports, the uat Compose project and volume, and how many backups to keep. The package reads the file itself and names the missing field when one is absent. A test fails when the fields it requires drift from the schema file.
- **Everything else is a convention, not config:**
  - `compose.base.yml` plus `compose.<env>.yml`, with the services `api` and `db` and the Compose profile `migrate`;
  - the environments `dev` and `uat`;
  - the proxy: the project and network `traefik`, and `compose.proxy.yml`;
  - the branch `origin/main` and the workflow `ci.yml`;
  - the table `__EFMigrationsHistory`;
  - state in `~/.claudalisk/apps/<name>/` (CLA-0066);
  - the `migrate` script runs the single `backend/<Name>.Api/<Name>.Api.csproj`, or the project named by `--project`.
- **Every command refuses to run in CI.** `assertHandRun` fails when `CI` or `GITHUB_ACTIONS` is set, before anything is read or run. One test runs every command with each variable set.
- **A backup works while the API is down.** Its folder is `<UTC timestamp>-<sha7>`, with `unknown` when the deployed commit cannot be read. Its `manifest.json` holds the reason, the deployed commit read from the API container (running or not) or from its image, the databases and the applied migrations.
- **Commands run programs with argument arrays**, never through a shell, and send SQL on stdin.

## Consequences

- One implementation of the guards serves every app. A safety fix is one pull request here and a version bump per app.
- An app cannot change the package's behaviour by editing it. It sets config, or asks for a change here.
- The new migration rules are not part of this decision: the one-fingerprint rule and approvals from `origin/main` are tracked in #7, and the CI workflow template and `npm audit signatures` in #18.
- A new package version needs a plugin version bump to release (CLA-0081) and the owner's approval on npm.
