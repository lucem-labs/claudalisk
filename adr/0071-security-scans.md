# CLA-0071: Security scans run in CI at three levels, and every suppression expires

- **Status:** accepted
- **Date:** 2026-10-26
- **Area:** environments
- **Enforced by:** CI (the security jobs and the weekly security workflow); the new-app CI template (#18); reviewer (suppressions)

## Context

Agents add packages, workflows and Dockerfiles quickly. A vulnerable package, a leaked key or an unsafe workflow trigger can reach `main` without anyone reading for it. CD also runs on `pull_request_target` (CLA-0030), which is unsafe if a workflow is written carelessly. New advisories appear for packages already in use, so a repository with no changes can become vulnerable. The tools must be free for private repositories, which rules out CodeQL and GitHub secret scanning for app repositories.

## Decision

### Level 1: every push, blocking

These jobs run in CI on every push, in parallel with the tests (CLA-0034). Each fails the run on an unsuppressed finding.

| Scan | Tool | What it checks |
|---|---|---|
| Secrets | [gitleaks](https://github.com/gitleaks/gitleaks) CLI | Keys, tokens and passwords in the pushed commits (CLA-0026) |
| Forbidden files | a script in the app | Real env files, dumps, backups and `*.local.json` files (CLA-0026) |
| NuGet packages | [lucem-labs/nuget-audit-action](https://github.com/lucem-labs/nuget-audit-action) | Vulnerable direct and transitive NuGet packages in `<Root>.slnx`, at every severity |
| npm packages | [OSV-Scanner](https://github.com/google/osv-scanner) | Vulnerable packages in `frontend/package-lock.json` |
| Code | .NET security analyzers, and [Semgrep CE](https://github.com/semgrep/semgrep) with the C# and TypeScript rule sets | Injection, unsafe deserialization, weak crypto and similar patterns |
| Workflows | [zizmor](https://github.com/zizmorcore/zizmor) | Unsafe triggers such as a `pull_request_target` that checks out the head, template injection, excessive permissions, unpinned actions |
| Dockerfiles and Compose | [Trivy](https://github.com/aquasecurity/trivy) in config mode | Containers that run as root, secrets in images, missing healthchecks and similar misconfiguration |

- The .NET analyzers run in the build. `AnalysisModeSecurity` is `All`, and warnings are errors.
- Third-party actions are pinned to a full commit SHA. zizmor's config allows the `lucem-labs/*` actions to be pinned to a major tag, such as `nuget-audit-action@v1`.

### Level 2: weekly, on `main`

A separate `security` workflow runs every week on a schedule and on manual dispatch.

- It runs the NuGet and npm scans again, so a new advisory for an unchanged package fails a run.
- It builds the app's images and scans them with Trivy in image mode, for vulnerable OS packages in the base images.
- A failure notifies the owner through GitHub. The agent fixes it in a pull request like any other issue (CLA-0021, CLA-0022).

### Level 3: weekly, against dev

- The same workflow runs an [OWASP ZAP](https://www.zaproxy.org) baseline scan against dev (CLA-0029). The baseline scan crawls and checks responses for missing security headers, cookie flags and information leaks. It sends no attacks.
- It never scans uat.

### Suppressions

- **Every suppression has an end date of at most 90 days and a reason.** It is changed only in a pull request, so the extension leaves a review trail.
  - NuGet: `.github/nuget-audit-suppressions.json`, which the action enforces.
  - npm: `osv-scanner.toml` with `ignoreUntil` and `reason`.
  - Trivy: `.trivyignore.yaml`, with `expired_at` and `statement`.
  - Semgrep and ZAP have no end-date field. A rule is turned off in their config only together with an open issue labelled `security-suppression` that gives the reason and the end date.
- gitleaks false positives go in `.gitleaksignore` by fingerprint. A real secret is never suppressed. It is rotated, and the commit is rewritten before the merge.

### Scope

- Every claudalisk app runs all three levels. new-app generates the jobs and the workflow.
- lucem-labs/claudalisk-dotnet runs levels 1 and 2, without the Dockerfile and image scans. It publishes packages to every app, so a vulnerable dependency there reaches all of them (CLA-0062).

## Consequences

- A vulnerable package fails the build, whether the push added it or a new advisory appeared.
- Every accepted risk is visible in a file, with a reason and a date when it fails again.
- Semgrep CE and the .NET analyzers find patterns, not data flow across files. Review still covers authorization and business-logic flaws.
- The ZAP baseline checks only what it can see from outside, so it does not replace review of the API's authorization rules.
