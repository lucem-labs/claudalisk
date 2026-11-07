---
name: work-issue
description: Takes one issue through its whole lifecycle in a claudalisk app, from the issue and its worktree to the uat review deploy, the owner's review and the merge cleanup. A script reads where the issue stands, and a workflow runs the implement and review stretch. Use when starting, resuming or finishing an issue.
argument-hint: "<issue number>"
user-invocable: true
---

# Work an issue

This skill strings the lifecycle ADRs together (CLA-0087). It does not restate them: each step names the ADR that holds its rules, so read that ADR before acting. The app's `AGENTS.md` wins where it lists a deviation (CLA-0028). One session works on one issue (CLA-0073).

## 0. Find the step

From the app's root, run:

```
node "${CLAUDE_PLUGIN_ROOT}/tools/work-issue.mjs" status <issue>
```

It reads the issue, its latest handoff note, the worktree, the pull request, CI and the uat deployment, read-only, and prints the step to start from, the next action and the ADRs. Start there. `--json` prints the same as an object. When it says stop, stop.

## 1. Check the issue

Refuse an issue labelled `needs-design-review`, and read the latest handoff note on it (CLA-0073, CLA-0022).

## 2. Branch

Create the issue's worktree and branch off an up-to-date `origin/main` with the command step 0 prints (CLA-0021).

## 3. Plan, implement and discover

The main thread plans and writes the brief for the implementer. Code discovery goes through the scout (CLA-0074, CLA-0080).

## 4. Verify

The implementer verifies with `scripts/verify.mjs`, and the change is checked on dev, which the implementer reports as `devVerified` (CLA-0076, CLA-0077, CLA-0029). The workflow stops at the implement stage unless both are true.

## 5. Review

Review with `/claudalisk:review` and fix or answer its findings (CLA-0023).

When the Workflow tool is available, steps 3 to 5 run as one saved workflow. Write the brief first, then call the Workflow tool with the saved workflow `claudalisk:implement-and-review` and these args:

```
{"issue": <number>, "worktree": "<absolute worktree path>", "brief": "<absolute path of the brief>", "pluginRoot": "${CLAUDE_PLUGIN_ROOT}", "since": "<reviewed head, for a fix round only>"}
```

- It returns `{stage: 'implement', implement}` when the implementer is blocked or failed. Answer its `questions` yourself or ask the owner, then run it again. Never guess a design question. The same stage comes back when the implementer is green but `devVerified` is false: verify on dev, then run the workflow again or continue by hand.
- It returns `{stage: 'reviewed', implement, plan, reviews, codeReviewEffort}` when the reviewers ran. It does not run `/code-review`. Run that yourself at `codeReviewEffort`, count the findings of `reviews` and `/code-review` as the review skill says, fix or answer them, and write the `## Review` section.

Without the Workflow tool, do the same with the Agent tool: the implementer with the brief, then the review skill's own steps.

## 6. Open the pull request and deploy uat

Open the pull request when the conditions of CLA-0023 hold, then review-deploy uat with the command step 0 prints (CLA-0030). Then tell the owner what to check on uat. The `review-handover` output style shapes that message; it is optional.

## 7. Hand over

Post a `## Handoff` note on the issue and stop (CLA-0073).

## 8. Owner's changes

Push the owner's requested changes through the same loop. Review again only what they touch, with `/claudalisk:review --since <reviewed head>`, and deploy uat again (CLA-0023).

## 9. After the merge

Only the owner merges (CLA-0024). Then remove the worktree with the `git worktree remove` command step 0 prints (CLA-0066), and file any bug found along the way as an issue (CLA-0022).
