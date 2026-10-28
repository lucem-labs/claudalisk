# CLA-0024: Only the owner merges, in GitHub

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** workflow
- **Enforced by:** guardrail hook (deny merge commands to the agent); deny-list backstop

## Context

GitHub does not enforce rulesets on private repositories on the free plan. A script gate was built. Then an approval switch that the agent typed once merged a pull request without sign-off. The permission classifier also blocked agent merges inconsistently, and the owner merged in the GitHub UI anyway.

## Decision

- **Only the owner merges**, straight from GitHub, after the owner reviews the pull request on uat (CLA-0023).
- **The agent never merges.** This rules out `gh pr merge`, the merge API (`gh api …/merge`), merge scripts, and pushing to `main`.
- **No merge-check script.** GitHub already holds the evidence the owner needs:
  - the CI check and the `up to date with main` status on the head commit (CLA-0034)
  - the `uat` deployment of that commit, recorded by CD (CLA-0030)

## Consequences

- No merge happens without a human action.
- There is no merge script to maintain and no approval switch for the agent to get wrong.
