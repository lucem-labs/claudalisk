# CLA-0034: CI runs once per pushed commit, fully parallel

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** environments
- **Enforced by:** generated CI workflow
- **Issue:** #18

## Context

An existing app's CI ran up to three times per change: on push, on ready-for-review and on merge.

## Decision

- **Triggers.** CI runs on pushes to branches other than `main`, plus manual dispatch. Checks belong to the commit, so pull request events don't re-run them.
- **Superseded runs.** Per-ref `concurrency` cancels them.
- **Runners.** `runs-on` reads a repository variable, so the repo can fall back to GitHub-hosted runners when the machine is off.
- **Pins.** The Playwright version is pinned exactly to the browsers baked into the runner image. Line endings are LF (`.gitattributes`).
- **Jobs.** Backend and frontend jobs run in parallel. Each starts its own throwaway PostgreSQL (CLA-0017). Backend tests do it through Testcontainers (CLA-0018), so the job needs Docker but no PostgreSQL service.

## Consequences

- One green run per commit is the evidence the merge check and the deploy guards use.
