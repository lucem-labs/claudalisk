# CLA-0087: A work-issue skill strings the lifecycle ADRs together, and a workflow runs the unattended middle

- **Status:** accepted
- **Date:** 2026-11-07
- **Area:** workflow
- **Enforced by:** `tools/work-issue.test.mjs` and `tools/implement-and-review.test.mjs` in CI's `adrs` job
- **Issue:** #16

## Context

An issue's lifecycle is spread over many ADRs: the issue and its worktree (CLA-0021), one session per issue (CLA-0073), the implementer and the scout (CLA-0074, CLA-0080), the verify script (CLA-0076, CLA-0077), the review, the uat deploy and the merge (CLA-0023, CLA-0030, CLA-0024). A session has to know which step an issue is at and which ADR to read. A Claude Code workflow runs agents unattended, but it cannot ask the user a question while it runs.

## Decision

- **A `work-issue` skill lists the lifecycle steps and names the ADR of each one.** It does not restate a rule, so each rule stays in the ADR that holds it. The `review-handover` output style is optional and shapes the message to the owner after the uat deploy.
- **`tools/work-issue.mjs status <issue>` reads where an issue stands,** read-only, through `gh` and `git`: the issue's labels and latest `## Handoff` note, the issue's worktree and branch, its pull request and CI, and the uat deployment of the pull request's head. It prints the step to start from, the next action and the ADRs. It never changes anything, and after a merge it only prints the `git worktree remove` command.
- **The `claudalisk:implement-and-review` workflow runs the unattended stretch:** the implementer, the review plan and the reviewer agents in parallel, with the models of CLA-0079 and the quorum of CLA-0023.
- **The main thread keeps what needs a person or the host:** the brief and the plan, design questions the implementer returns, `/code-review`, counting the findings, the pull request, the uat deploy and the handover, because a workflow cannot ask the user mid-run.
- **Issues follow one convention:** the sections "Depends on", "Goal", "Design" and "Acceptance criteria", and the labels `epic` and `needs-design-review`. `new-app` creates the labels once it exists.

## Consequences

- A resumed session runs one command to learn its step, instead of reconstructing it from the issue, the branch and the pull request.
- The rules are written once, in their ADRs; the skill, the script and the workflow only point to them and are changed together with them.
- Without the Workflow tool, the skill's steps run on the Agent tool and give the same result.
- The status script can only read what GitHub and git record. A uat deploy that was not recorded as a deployment reads as not yet done.
