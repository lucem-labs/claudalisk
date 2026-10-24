# CLA-0025: Stacked pull requests merge in order without closing children

- **Status:** proposed
- **Date:** 2026-10-24
- **Area:** workflow
- **Enforced by:** merge-pr skill (planned)
- **Issue:** #5

## Context

An existing app built a whole epic as stacked pull requests. Deleting a merged parent's branch auto-closed its child pull request.

## Decision

- Never delete a branch while an open pull request uses it as its base.
- After the parent squash-merges, fold `main` into the child with `git merge -s ours origin/main`. This is valid because `main`'s tree now equals the parent tip.
- Then push the child, retarget it to `main`, and cancel CI runs made obsolete by the fold. Only then merge the child.

## Consequences

- Stacks merge one by one with no lost pull requests.
