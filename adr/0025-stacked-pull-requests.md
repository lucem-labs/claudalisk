# CLA-0025: Stacked pull requests merge in order without closing children

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** workflow
- **Enforced by:** workflow skill and reviewer; GitHub repository setting (no auto-delete of head branches)
- **Issue:** #5

## Context

An existing app built a whole epic as stacked pull requests. When a merged parent's branch was deleted, GitHub closed the child pull request automatically.

## Decision

- Stacked work branches from the parent issue's branch. Its pull request targets that branch.
- Never delete a branch while an open pull request uses it as its base. The repository does not auto-delete head branches on merge. The owner deletes a merged branch only when nothing targets it.
- After the owner squash-merges the parent, the agent does these steps:
  1. Fold `main` into the child with `git merge -s ours origin/main`. This is valid because the tree of `main` now equals the parent tip.
  2. Push the child.
  3. Retarget the child to `main`.
  4. Cancel CI runs that the fold made obsolete.

  The owner then reviews and merges the child like any other pull request (CLA-0023, CLA-0024).

## Consequences

- Stacks merge one by one and no pull request is lost.
