# CLA-0025: Stacked pull requests merge without closing children, whatever the merge method

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** workflow
- **Enforced by:** workflow skill and reviewer
- **Issue:** #5

## Context

An existing app built a whole epic as stacked pull requests. When a merged parent's branch was deleted, GitHub closed the child pull request automatically. The owner merges stacks in different ways: one pull request at a time, or the whole stack at once from its top, with a merge commit or a squash.

## Decision

- Stacked work branches from the parent issue's branch. Its pull request targets that branch.
- **The merge method is the owner's choice.** Claudalisk puts no constraint on it. The steps below work after a merge commit and after a squash.
- **The agent never deletes a branch that an open pull request targets.** When the repository deletes a merged head branch, GitHub retargets the child pull requests to the parent's base, so they stay open.
- **After a parent merges, the agent updates each child:**
  1. If the child still targets the merged branch, the agent retargets it to `main`.
  2. The agent merges `origin/main` into the child with a normal merge, resolves any conflicts, and pushes. It never uses `git merge -s ours`, which is valid only after a squash.
  3. The owner then reviews and merges the child like any other pull request (CLA-0023, CLA-0024).
- When the owner merges a whole stack from its top, every pull request in it is merged at once, and there is nothing to update.

## Consequences

- No pull request in a stack is lost, whichever way the owner merges.
- A child may need conflict resolution after a squashed parent, because its history still holds the parent's original commits.
