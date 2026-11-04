---
name: review
description: Runs claudalisk's review of a branch or pull request before it opens (CLA-0023). A script plans the review from the diff, Sonnet reviewer agents check ADR conformance and uat data safety, the built-in /code-review checks correctness and security, and Opus, Sonnet and Haiku form a quorum only on high-risk uat data changes. Use when CI is green and dev is verified, before opening a pull request, and again after fixing findings.
argument-hint: "[<PR number> | <base ref>] [--since <reviewed head>] [--comment]"
user-invocable: true
---

# Review

This is the review that CLA-0023 requires before a pull request opens, with the models of CLA-0079. Run it in the main thread: it starts the reviewer agents and `/code-review`, and subagents cannot start agents of their own. Never approve, request changes or merge (CLA-0024).

## 1. Before you start

- CI is green on the branch head and the change is verified on dev (CLA-0023). If not, finish that first.
- The branch under review is checked out, so the reviewers can read the files with the right line numbers. For a pull request, run `gh pr checkout <number>` first.

## 2. Plan the review

Run `git fetch origin main`, so the base is current, then run the plan script from the app's root:

```
node "${CLAUDE_PLUGIN_ROOT}/tools/review-plan.mjs" [--pr <number> | --base <ref>] [--since <reviewed head>]
```

- With no option it reviews the current branch against `origin/main`.
- `--comment` belongs to this skill, not the script; the script ignores it.
- `--since <sha>` is a fix round: it plans only the diff from the head you reviewed last, so only the domains whose files the fix changed are reviewed again.

The script uses no model. It maps each changed file to the knowledge skills through their `paths` and lists their ADRs. It marks the change high-risk when it touches uat data (migrations, the deploy, init, backup, restore and refresh scripts, the uat Compose file, the agent's deny list and hooks) or security-relevant paths. An app adds its own paths under `review.uatData` and `review.security` in `.claude/claudalisk.json`. The script writes one brief per agent and prints a JSON summary: `agents` (domain, model, brief path), `codeReview.effort`, `highRisk` and its `reasons`, `unmapped` files and `skipped` lock files.

## 3. Run the reviewers

In one message, start every agent from `agents` in parallel, and run `/code-review`:

- Each agent is `claudalisk:reviewer`, with the prompt `Review the brief at <brief path>.` Leave its model and effort to its frontmatter (Sonnet, medium). For a quorum agent, pass the summary's `model` (`opus`, `sonnet` or `haiku`) in the call. Every quorum agent runs at medium effort (CLA-0079).
- Run the built-in `/code-review` with the summary's `codeReview.effort` (`medium`, or `high` on a high-risk change) for correctness and security. claudalisk adds no agent for what it covers.

When `agents` is empty, because no changed file is in a knowledge skill's area, run `/code-review` alone. Do not review the diff yourself while they run, and do not re-read the files they report on unless you are about to fix them.

## 4. Count the findings

- Outside the quorum, every finding of a reviewer and of `/code-review` counts.
- In the `uat-data` quorum, a finding counts when at least two of the three models report it: the same place, or lines next to each other, and the same problem, which the ADR id and tag usually show. A finding only one model reports is optional. List it, but it does not block.
- A finding a reviewer lists as **Accepted** is a deviation that `AGENTS.md` lists. It is not a finding.

## 5. Fix or answer

Fix each counted finding, or answer it with why not. A fix goes through the same loop: CI green and dev verified on the new head (CLA-0023, CLA-0076). Then plan again with `--since <the head you reviewed>` and run only the agents that plan names. A fix that makes the change high-risk gets the quorum.

## 6. Report

Put the review into the pull request description:

```
## Review

Domains and models: adr-conformance (sonnet); uat-data (opus, sonnet, haiku); /code-review (high).

| Finding | Domain | Where | Done |
|---|---|---|---|
| CLA-0030 restore-over-newer-data | uat-data (3 of 3) | scripts/deploy.mjs:88 | Fixed in <sha> |

Optional (one model only): ...
```

List the domains and models that ran, each counted finding and what was done about it, and the single-model quorum findings separately as optional. Name ADRs by id.

## `--comment`

When asked for `--comment`, show the user the findings you would post and ask first. After they confirm, post each one as an inline review comment on its `path` and `line` with `gh api repos/{owner}/{repo}/pulls/{number}/comments`. For `/code-review`'s own findings, its `--comment` option does the same. Never submit a review that approves or requests changes.
