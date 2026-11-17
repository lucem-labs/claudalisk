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

**CI checks every push** with a secret scan and a forbidden-file check (CLA-0071). The gitleaks CLI runs directly, because gitleaks-action needs a licence on organization repositories. A secret scanner cannot recognise real data or screenshots, so the file check and review cover those.

## Consequences

- The repository can be shared without leaking the owner's data.
