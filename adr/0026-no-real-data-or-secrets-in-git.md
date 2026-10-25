# CLA-0026: Real data and secrets never go into commits, pull requests or issues

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** workflow
- **Enforced by:** `.gitignore`; guardrail hook (ask on force-adding ignored env, backup or dump files)

## Decision

These never appear in commits, pull requests, issues or comments:

- env files with real values, such as `dev.env` and `uat.env` (proposed to live outside the checkout in CLA-0066)
- backups, dumps and `*.local.json` files
- database contents and screenshots of real data

Test fixtures are allowed. Example env files hold placeholders that cannot work, never a usable password.

## Consequences

- The repository can be shared without leaking the owner's data.
