---
name: workflow
description: Claudalisk workflow decisions (ADRs). Covers issue-driven work, Dependabot updates, one branch, pull request and session per issue, handoff notes, the implementer subagent, no drafts, bugs found along the way, when a pull request is ready, the multi-agent review before it opens, waiting for CI in one call, owner review on uat, who merges, keeping real data and secrets out of git, and how an app's AGENTS.md records deviations. Use when starting an issue, branching, opening or merging a pull request, filing an issue, or editing AGENTS.md in a claudalisk app.
user-invocable: false
---

# Workflow

These are claudalisk's decisions for how work moves from an issue to `main`. The app's `AGENTS.md` wins where it lists a deviation (CLA-0028). Before acting on one of these steps, read the ADR.

- [CLA-0021](${CLAUDE_PLUGIN_ROOT}/adr/0021-issue-driven-work.md) (accepted): every change starts from an issue and becomes one branch in a worktree and one pull request. Open the pull request only when it is ready, and never as a draft. Dependabot pull requests are the one exception.
- [CLA-0073](${CLAUDE_PLUGIN_ROOT}/adr/0073-one-session-per-issue.md) (accepted): one session works on one issue. To hand over, post a handoff note as a comment on the issue and stop; the next session starts from the issue and its latest handoff note.
- [CLA-0074](${CLAUDE_PLUGIN_ROOT}/adr/0074-main-thread-plans-subagent-iterates.md) (accepted): the main thread plans and reviews; once an issue is scoped, the `claudalisk:implementer` subagent runs the build, test and fix loop, commits and pushes only through the verify script, stops on design questions and returns a report of at most 300 words.
- [CLA-0072](${CLAUDE_PLUGIN_ROOT}/adr/0072-dependabot-updates.md) (accepted): Dependabot opens security updates and weekly grouped version updates for NuGet, npm, actions and Docker. Nothing auto-merges; the owner merges. When CI fails, the agent fixes the Dependabot branch.
- [CLA-0022](${CLAUDE_PLUGIN_ROOT}/adr/0022-bugs-found-become-issues.md) (accepted): bugs found along the way become new `needs-design-review` issues, not inline fixes. A test whose failure the pull request's change does not explain is rerun once: a pass means a flaky-test issue with the run id and test name, a second failure is investigated as a bug. Test runners do not retry in CI.
- [CLA-0023](${CLAUDE_PLUGIN_ROOT}/adr/0023-ready-signoff-and-merge.md) (accepted): open the pull request (never a draft) when CI is green, dev is verified and the multi-agent review is done: one agent per touched domain, and three models with a two-of-three quorum where uat data or security is at risk. The pull request lists the findings and what was done about each. The agent review-deploys it to uat, and the owner reviews there and merges.
- [CLA-0077](${CLAUDE_PLUGIN_ROOT}/adr/0077-wait-for-ci-in-one-call.md) (accepted): wait for green CI in one blocking call (`node scripts/verify.mjs` in the background), never by polling; after the pull request is open, the host's pull request monitor is enough where there is one.
- [CLA-0024](${CLAUDE_PLUGIN_ROOT}/adr/0024-owner-merges.md) (accepted): only the owner merges, in GitHub. The agent never merges.
- [CLA-0026](${CLAUDE_PLUGIN_ROOT}/adr/0026-no-real-data-or-secrets-in-git.md) (accepted): env files, backups, dumps and real data never go into commits, pull requests or issues; CI runs gitleaks and a forbidden-file check.
- [CLA-0028](${CLAUDE_PLUGIN_ROOT}/adr/0028-app-agents-md-wins.md) (accepted): the app's `AGENTS.md` holds app facts and lists deviations by ADR id.
- [CLA-0016](${CLAUDE_PLUGIN_ROOT}/adr/0016-every-change-ships-with-tests.md) (accepted): done includes the tests and their results.
- [CLA-0066](${CLAUDE_PLUGIN_ROOT}/adr/0066-environment-state-outside-the-checkout.md) (accepted): env files live outside the checkout, so worktrees need nothing copied; remove an issue's worktree after its merge.
