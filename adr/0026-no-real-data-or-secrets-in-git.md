# CLA-0026: Real data and secrets never go into commits, pull requests or issues

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** workflow
- **Enforced by:** `.gitignore`; guardrail hook (ask on force-adding ignored env, backup or dump files); CI (gitleaks secret scan and a forbidden-file check)

## Decision

These never appear in commits, pull requests, issues or comments:

- env files with real values, such as `dev.env` and `uat.env`, which live outside the checkout (CLA-0066)
- backups, dumps and `*.local.json` files
- database contents and screenshots of real data

Test fixtures are allowed. Example env files hold placeholders that cannot work, never a usable password.

**CI checks every pull request:**

- **Secrets:** the gitleaks CLI scans the pull request's commits and fails on a finding. It runs the CLI directly, because gitleaks-action needs a licence on organization repositories.
- **Files:** a check fails when the pull request adds a file that matches a forbidden pattern: an env file other than `*.example`, a dump or backup, or a `*.local.json` file.

A secret scanner cannot recognise real data or screenshots. The file check and review cover those.

## Consequences

- The repository can be shared without leaking the owner's data.
