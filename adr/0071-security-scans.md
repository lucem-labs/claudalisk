# CLA-0071: Security scans run in CI at three levels, and every suppression expires

- **Status:** accepted
- **Date:** 2026-10-26
- **Area:** environments
- **Enforced by:** CI (the security jobs, the suppression check, the source-hygiene check and the weekly security workflow); the new-app CI template and the security templates in `templates/app/`; reviewer (suppressions, overrides and Compose files)
- **Issue:** #87

## Context

Agents add packages, workflows and Dockerfiles quickly. A vulnerable package, a leaked key or an unsafe workflow trigger can reach `main` without anyone reading for it, and new advisories appear for packages already in use. The tools must be free for private repositories, which rules out CodeQL and GitHub secret scanning for app repositories.

## Decision

### Level 1: every push, blocking

These jobs run on every push, in parallel with the tests (CLA-0034), and each fails the run on an unsuppressed finding.

| Scan | Tool | What it checks |
|---|---|---|
| Secrets | [gitleaks](https://github.com/gitleaks/gitleaks) CLI | Keys, tokens and passwords in the pushed commits (CLA-0026) |
| Forbidden files | a script in the app | Real env files, dumps, backups and `*.local.json` files (CLA-0026) |
| NuGet packages | [lucem-labs/nuget-audit-action](https://github.com/lucem-labs/nuget-audit-action) | Vulnerable direct and transitive packages, at every severity |
| npm packages | [OSV-Scanner](https://github.com/google/osv-scanner) | Vulnerable packages in `frontend/package-lock.json` |
| Code | .NET security analyzers (`AnalysisModeSecurity` `All`, warnings as errors, test projects too), and [Semgrep CE](https://github.com/semgrep/semgrep) with the C# and TypeScript rule sets | Injection, unsafe deserialization, weak crypto and similar patterns |
| Source hygiene | a script in the app | A BOM inside a file, zero-width characters and bidi overrides, outside test fixtures |
| Workflows | [zizmor](https://github.com/zizmorcore/zizmor) | Unsafe triggers, template injection, excessive permissions, unpinned actions |
| Dockerfiles | [Trivy](https://github.com/aquasecurity/trivy) in config mode | Containers that run as root, secrets in images, missing healthchecks |

- Trivy has no Compose scanner, so Compose files are left to review.
- Every action, the `lucem-labs/*` ones included, is pinned to a full commit SHA, and zizmor's config enforces it. Scanner binaries that a job downloads are pinned to a version and checked against a SHA-256 before they run.

### Level 2: weekly, on `main`

A separate `security` workflow runs weekly and on manual dispatch. It reruns the NuGet and npm scans, so a new advisory for an unchanged package fails a run, and scans the app's built images with Trivy for vulnerable OS packages. A failure notifies the owner, and the agent fixes it in a pull request (CLA-0021).

### Level 3: weekly, against dev

The same workflow runs an [OWASP ZAP](https://www.zaproxy.org) baseline scan against dev (CLA-0029). It crawls and checks responses for missing security headers, cookie flags and information leaks, and sends no attacks. It never scans uat.

### Suppressions

- **Every suppression has a reason and an end date at most 90 days away,** and changes only in a pull request:
  - NuGet: `.github/nuget-audit-suppressions.json`, which the action enforces;
  - npm: `osv-scanner.toml` with `ignoreUntil` and `reason`;
  - Trivy: `.trivyignore.yaml` with `expired_at` and `statement`;
  - .NET analyzers: `[SuppressMessage]` at the narrowest scope, with a `Justification` that ends `Until yyyy-MM-dd.`. `#pragma warning disable`, `NoWarn` and `.editorconfig` never turn a security rule off;
  - Semgrep and ZAP have no end-date field, so a rule is turned off only together with an open `security-suppression` issue that gives the reason and the end date. The informational ZAP rules that fire on every single-page app may be set to `INFO` in the generated rules file without one.
- The app's suppression check fails a run on a missing, past or too distant date.
- A vulnerable npm package that another package pins is forced to the fixed release with an `overrides` entry, with the reason in the pull request. Only when no fixed release exists does it get a suppression.
- gitleaks false positives go in `.gitleaksignore` by fingerprint. A real secret is never suppressed: it is rotated, and the commit is rewritten before the merge.

### Scope

Every claudalisk app runs all three levels, and new-app generates the jobs and the workflow. lucem-labs/claudalisk-dotnet runs levels 1 and 2 without the Docker scans, because its packages reach every app (CLA-0062).

## Consequences

- A vulnerable package fails the build, whether the push added it or a new advisory appeared.
- Every accepted risk is visible in a file, with a reason and a date when it fails again.
- Compose misconfiguration has no scanner and depends on review. The pattern scanners and the ZAP baseline do not see data flow, authorization or business-logic flaws, which review still covers.
