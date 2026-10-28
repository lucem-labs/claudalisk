# CLA-0034: CI runs once per pushed commit, fully parallel

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** environments
- **Enforced by:** generated CI workflow
- **Issue:** #18, #64

## Context

CI that triggers on push, on ready-for-review and on merge runs up to three times per change. A run on `main` after a merge also repeats work: when the branch contained `main`, the merge commit has exactly the tree that CI tested on the branch head. It only adds something when `main` moved between the branch's run and the merge, and that case can be caught before the merge.

## Decision

- **Triggers.** CI runs on every push except to `main`, and on manual dispatch, which also works on `main`. The separate `security` workflow also runs weekly (CLA-0071). Checks belong to the commit, so pull request events do not re-run them.
- **Up to date with `main`.** A pull request merges only from a branch that contains `main`, so its merge commit has the same tree as the branch head that CI tested:
  - CI has a `base` job. It compares the pushed commit with `main` (GitHub's compare API), sets the commit status `up to date with main`, and fails the run when the branch is behind.
  - A `base` workflow runs on every push to `main`. It sets the same status on the head of every open pull request into `main`, so a pull request turns red once `main` moves past it.
  - The repository allows **Update branch**. Updating pushes a merge of `main`, and CI runs on the combined code.
  - Where the plan allows rulesets, a ruleset on `main` requires the CI checks and up-to-date branches. On GitHub's free plan for private repositories it can't, so the status is advisory and the owner reads it before merging (CLA-0024).
- **Superseded runs.** Per-ref `concurrency` cancels them.
- **Runners.** `runs-on` reads a repository variable. When the machine is off, the repo can fall back to GitHub-hosted runners.
- **Pins.** The Playwright version is pinned exactly to the browsers in the runner image. Line endings are LF (`.gitattributes`).
- **Jobs.** Backend and frontend jobs run in parallel. Each job starts its own throwaway PostgreSQL (CLA-0017). Backend tests start it through Testcontainers (CLA-0018), so the job needs Docker but no PostgreSQL service.

## Consequences

- CD waits for one green run before it deploys (CLA-0030). For a merge commit, that is the run of the merged pull request's head with the same tree. When the trees differ (a branch merged while behind `main`), CD dispatches CI on `main` first. The owner sees the run and the `up to date with main` status next to the Merge button (CLA-0024).
- CD is a separate workflow. CLA-0030 describes it.
