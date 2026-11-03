# CLA-0022: Bugs found along the way become new issues

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** workflow
- **Enforced by:** reviewer
- **Issue:** #89

## Decision

- File a bug found while working on something else as a new issue labelled `needs-design-review`. Do not fix it inline.
- The current pull request stays about its own issue.
- **A test that fails on a pull request whose change does not explain the failure** is rerun once, with `gh run rerun <run-id> --failed`.
  - If the rerun passes, the test is flaky. File an issue for it like any bug found along the way, with the CI run id and the test's name, before the work on the pull request continues. Do not fix the test inline.
  - If it fails again, investigate it as a bug. A fault the pull request caused is fixed in that pull request. Any other fault is a bug found along the way and becomes a new issue.
  - Never run it a third time, and never skip or disable the test to get the pull request through.
  - Test runners do not retry in CI (Playwright's `retries: 0`), so a flaky test fails the run instead of passing unseen.

## Consequences

- Pull requests stay reviewable, and bugs get a design discussion instead of a quick patch.
- Every flaky test has an issue with the run that showed it, so it gets fixed instead of being rerun until it passes.
