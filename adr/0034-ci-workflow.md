# CLA-0034: CI runs once per pushed commit, fully parallel

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** environments
- **Enforced by:** generated CI workflow
- **Issue:** #18

## Context

An existing app's CI ran up to three times per change: on push, on ready-for-review and on merge.

## Decision

- **Triggers.** CI runs on every push, including to `main`, plus manual dispatch. Checks belong to the commit, so pull request events don't re-run them. The run on `main` tests the squash commit that CD deploys after a merge.
- **Superseded runs.** Per-ref `concurrency` cancels them.
- **Runners.** `runs-on` reads a repository variable, so the repo can fall back to GitHub-hosted runners when the machine is off.
- **Pins.** The Playwright version is pinned exactly to the browsers baked into the runner image. Line endings are LF (`.gitattributes`).
- **Jobs.** Backend and frontend jobs run in parallel. Each starts its own throwaway PostgreSQL (CLA-0017). Backend tests do it through Testcontainers (CLA-0018), so the job needs Docker but no PostgreSQL service.

## Consequences

- One green run per commit is what CD waits for before deploying (CLA-0030), and what the owner sees next to the Merge button (CLA-0024).
- **CD is a separate workflow** (`cd.yml`):
  - it runs on the deploy runner (CLA-0033);
  - it is triggered when CI completes (`workflow_run`) and when a pull request is opened or reopened (`pull_request: opened, reopened`);
  - it deploys a commit only when CI succeeded on it and the commit is `main` or the head of an open pull request;
  - deploys are queued one at a time and never cancelled midway.
