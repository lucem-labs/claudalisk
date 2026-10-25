# CLA-0025: Stacked pull requests merge in order without closing children

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** workflow
- **Enforced by:** workflow skill and reviewer; GitHub repository setting (don't auto-delete head branches)
- **Issue:** #5

## Context

An existing app built a whole epic as stacked pull requests. Deleting a merged parent's branch auto-closed its child pull request.

## Decision

- Stacked work branches from the parent issue's branch, and its pull request targets that branch.
- Never delete a branch while an open pull request uses it as its base. The repository doesn't auto-delete head branches on merge, and the owner deletes a merged branch only once nothing targets it.
- After the owner squash-merges the parent, the agent:
  1. folds `main` into the child with `git merge -s ours origin/main`. This is valid because `main`'s tree now equals the parent tip;
  2. pushes the child;
  3. retargets the child to `main`;
  4. cancels CI runs made obsolete by the fold.

  The owner then reviews and merges the child like any other pull request (CLA-0023, CLA-0024).

## Consequences

- Stacks merge one by one with no lost pull requests.
