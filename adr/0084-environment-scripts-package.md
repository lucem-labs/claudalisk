# CLA-0084: The environment scripts ship as a pinned npm package, called by thin entries

- **Status:** accepted
- **Date:** 2026-11-05
- **Area:** environments
- **Enforced by:** `packages/scripts` and its tests in CI's `adrs` job; `.github/workflows/release.yml` (CLA-0081); npm trusted publishing and the owner's approval; reviewer (no copied or edited logic in an app's entry scripts)
- **Issue:** #14

## Context

Two apps copied the same deploy, backup and restore scripts, and a safety fix made in one copy never reached the other. The guards, the migration checks and the backup logic must exist once and reach every app by a version bump, the way the .NET infrastructure does (CLA-0062).

Rejected: running the scripts from the plugin.

- CI has no plugin installed, yet the scripts' tests and the CI-run scripts run there.
- The owner runs a uat restore by hand in a terminal, where `${CLAUDE_PLUGIN_ROOT}` does not exist.
- A uat deploy should be reproducible from its commit, and code in the plugin cache depends on whichever version the machine installed.
- The guardrail's rules and `AGENTS.md` name stable paths such as `node scripts/restore.mjs --environment uat` (CLA-0083).

## Decision

- **The scripts' logic is the npm package `@claudalisk/scripts`**, in `packages/scripts` of this repository. It is public, MIT, ESM and uses only Node's standard library. It holds:
  - the deploy and its guards (CLA-0030) and the migration checks (CLA-0010);
  - backups and restores (CLA-0031), the dev refresh (CLA-0032), init (CLA-0066) and migrate (CLA-0008);
  - the scripts CI runs, such as the comment check (CLA-0035), the locator check (CLA-0070), the security tools with their pinned SHA-256 checksums (CLA-0071) and the TRX annotations (CLA-0076).

  Each is tested with `node:test` over an injected command runner (CLA-0027). One exact version brings a fix or a scanner pin bump to every app.
- **Each app keeps a thin entry script at a stable path,** `scripts/<name>.mjs`, copied from `templates/app/scripts/`. It only calls `runMain` with the package's function of the same name, so a fix never needs an edit in the app. The package's README lists the entries.
- **The package has its own version,** apart from the plugin's, and it follows CLA-0098.
- **An app pins an exact version** in `package.json`, so the lockfile fixes what a deploy runs. CI and the owner install it with `npm ci`. A fix reaches an app as a version bump in a normal pull request.
- **Publishing goes only through the release workflow** (CLA-0081).
- **App values come from `.claude/claudalisk.json`** (CLA-0082). The package names a missing field, and a test fails when the fields it requires drift from the schema. Everything else is a fixed convention, which the package's README lists.
- **Every command that changes an environment refuses to run in CI.** `assertHandRun` fails when `CI` or `GITHUB_ACTIONS` is set, before anything is read or run, and a test runs each command with each variable set. The CI-run scripts and `check-migrations` run in CI by design.
- **The owner gate for `prune-backups --apply` is guardrail rule 4** (CLA-0083), together with the script's refusal in CI and its protection of restore points (CLA-0031).

## Consequences

- One implementation of the guards serves every app. A safety fix is one pull request here and a version bump per app.
- An app cannot change the package's behaviour by editing it. It sets config, or asks for a change here.
- A new package version needs a plugin version bump to release (CLA-0081) and the owner's approval on npm.
