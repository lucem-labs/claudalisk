# CLA-0024: Only the owner merges, in GitHub

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** workflow
- **Enforced by:** guardrail hook (deny merge commands to the agent); deny-list backstop

## Context

GitHub doesn't enforce rulesets on private repositories on the free plan. A script gate was built, and an approval switch the agent typed once merged a pull request without sign-off. The permission classifier also blocked agent merges inconsistently, and in practice the owner merged in the GitHub UI anyway.

## Decision

- **Only the owner merges**, straight from GitHub, after reviewing the pull request on uat (CLA-0023).
- **The agent never merges.** That rules out `gh pr merge`, the merge API (`gh api …/merge`), merge scripts, and pushing to `main`.
- **No merge-check script.** The evidence the owner needs is already in GitHub:
  - the CI check on the head commit;
  - the `uat` deployment of that commit, recorded by CD (CLA-0030).

## Consequences

- No merge happens without a human action.
- There is no merge script to maintain, and no approval switch for the agent to get wrong.
