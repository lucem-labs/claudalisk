# CLA-0034: CI runs once per pushed commit, fully parallel

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** environments
- **Enforced by:** generated CI workflow
- **Issue:** #18

## Context

An existing app's CI ran up to three times per change: on push, on ready-for-review and on merge.

## Decision

- **Triggers.** CI runs on every push, including to `main`, and on manual dispatch. Checks belong to the commit, so pull request events do not re-run them. The run on `main` tests the squash commit that CD deploys after a merge.
- **Superseded runs.** Per-ref `concurrency` cancels them.
- **Runners.** `runs-on` reads a repository variable. When the machine is off, the repo can fall back to GitHub-hosted runners.
- **Pins.** The Playwright version is pinned exactly to the browsers in the runner image. Line endings are LF (`.gitattributes`).
- **Jobs.** Backend and frontend jobs run in parallel. Each job starts its own throwaway PostgreSQL (CLA-0017). Backend tests start it through Testcontainers (CLA-0018, proposed), so the job needs Docker but no PostgreSQL service.

## Consequences

- CD waits for one green run per commit before it deploys (CLA-0030). The owner sees the same run next to the Merge button (CLA-0024).
- CD is a separate workflow that starts when CI completes. CLA-0030 describes it.
