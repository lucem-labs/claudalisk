# CLA-0072: Dependabot opens grouped dependency updates, and the owner merges them

- **Status:** accepted
- **Date:** 2026-10-26
- **Area:** workflow
- **Enforced by:** `.github/dependabot.yml` from the new-app template; repository settings (the owner turns on Dependabot alerts and security updates); reviewer

## Context

The security scans report a vulnerable package or an outdated base image, but someone still has to write the fix (CLA-0071). Actions pinned to a commit SHA need updating by hand. A new claudalisk package release reaches an app only as a version bump (CLA-0062). Dependabot opens those updates as pull requests, and it is free on private repositories.

## Decision

- **Every claudalisk app and lucem-labs/claudalisk-dotnet has a `.github/dependabot.yml`** for each ecosystem it uses:
  - `nuget` in `backend/`, including the `Claudalisk.*` packages;
  - `npm` in `frontend/`;
  - `github-actions` in `/`, which also updates SHA-pinned actions;
  - `docker` and `docker-compose` for the base images.
- **Security updates are on.** Dependabot opens one as soon as an advisory affects a package in use.
- **Version updates run weekly,** with one group per ecosystem for minor and patch versions. A major version gets its own pull request, because it can need code changes.
- **A Dependabot pull request is its own issue.** It is the one exception to "every change starts from an issue" (CLA-0021).
- **Nothing auto-merges.** The owner reviews and merges every Dependabot pull request, like any other (CLA-0024). The repository has no auto-merge workflow for them.
- **The agent fixes a failing update.**
  - When CI fails on a Dependabot pull request, the agent pushes the fix to that branch, such as a changed API call or an updated test.
  - After that push, Dependabot stops rebasing the branch, so the agent merges `origin/main` into it when needed.
  - For a major version that needs more than a small fix, the agent opens an issue instead (CLA-0022).
- **CD does not deploy Dependabot pull requests** (CLA-0030): it deploys only pull requests that the owner's account opened. CI is their gate. To try an update on uat, the agent opens its own pull request with it.

## Consequences

- A vulnerable package usually has a fix waiting as a pull request before the weekly scan reports it.
- Action pins, base images and claudalisk packages stay current without anyone tracking them.
- The owner reviews a few grouped pull requests each week.
- An update that breaks the build is fixed on its own branch and never blocks other work.
