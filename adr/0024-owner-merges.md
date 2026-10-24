# CLA-0024: The owner merges; the agent runs the merge check

- **Status:** proposed
- **Date:** 2026-10-24
- **Area:** workflow
- **Enforced by:** guardrail hook (deny merge commands to the agent); merge-pr skill
- **Issue:** #3, #4

## Context

GitHub doesn't enforce rulesets on private repositories on the free plan, so a script gate was built. An approval switch typed by the agent once merged a pull request without sign-off. The permission classifier also blocks agent merges inconsistently, and in practice the owner merged in the GitHub UI.

## Decision

- The agent runs a read-only merge check that reports a verdict with reasons:
  - the pull request is open, not a draft, and mergeable;
  - the latest run of each check succeeded;
  - prod runs the head.
- The owner merges.
- The agent never runs `gh pr merge` or the merge API.
- Owner approval comes from a permission prompt or the owner's own text, never from a switch the agent types.

## Consequences

- No merge happens without a human action.
