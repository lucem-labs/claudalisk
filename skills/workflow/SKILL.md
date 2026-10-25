---
name: workflow
description: Claudalisk workflow decisions (ADRs) - issue-driven work, one branch and pull request per issue, no drafts, stacked pull requests, bugs found along the way, when a pull request is ready, owner review on uat, who merges, keeping real data and secrets out of git, and how an app's AGENTS.md records deviations. Use when starting an issue, branching, opening, marking ready or merging a pull request, filing an issue, or editing AGENTS.md in a claudalisk app.
user-invocable: false
---

# Workflow

These are claudalisk's decisions for how work moves from an issue to `main`. The app's own `AGENTS.md` wins where it lists a deviation (CLA-0028). Before acting on one of these steps, read the ADR.

- [CLA-0021](${CLAUDE_PLUGIN_ROOT}/adr/0021-issue-driven-work.md) (accepted): every change starts from an issue and becomes one branch in a worktree and one pull request, opened only when ready and never a draft.
- [CLA-0022](${CLAUDE_PLUGIN_ROOT}/adr/0022-bugs-found-become-issues.md) (accepted): bugs found along the way become new `needs-design-review` issues, not inline fixes.
- [CLA-0023](${CLAUDE_PLUGIN_ROOT}/adr/0023-ready-signoff-and-merge.md) (accepted): open the pull request (never a draft) when CI is green and dev is verified; CD puts it on uat; the owner reviews there and merges.
- [CLA-0024](${CLAUDE_PLUGIN_ROOT}/adr/0024-owner-merges.md) (accepted): only the owner merges, in GitHub; the agent never merges.
- [CLA-0025](${CLAUDE_PLUGIN_ROOT}/adr/0025-stacked-pull-requests.md) (proposed): never delete a branch that an open pull request targets; fold, retarget, then merge.
- [CLA-0026](${CLAUDE_PLUGIN_ROOT}/adr/0026-no-real-data-or-secrets-in-git.md) (accepted): env files, backups, dumps and real data never go into commits, pull requests or issues.
- [CLA-0028](${CLAUDE_PLUGIN_ROOT}/adr/0028-app-agents-md-wins.md) (accepted): the app's `AGENTS.md` holds app facts and lists deviations by ADR id.
- [CLA-0016](${CLAUDE_PLUGIN_ROOT}/adr/0016-every-change-ships-with-tests.md) (accepted): done includes the tests and their results.
