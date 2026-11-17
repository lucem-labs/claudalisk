# CLA-0023: Open the pull request when CI is green, dev is verified and the review is done; the owner reviews on uat and merges

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** workflow
- **Enforced by:** the uat deploy script (deploys only open pull requests whose CI succeeded); guardrail hook on `gh pr create` (CI must be green on the head, CLA-0083); the claudalisk review skill (`/claudalisk:review`) and its plan script (`tools/review-plan.mjs`); reviewer
- **Issue:** #90, #127, #53

## Context

Rejected: draft pull requests. Someone had to click "Ready for review" before anything happened, and the draft state told the owner nothing.

Tests and the owner's review on uat still miss some bugs. In one change to the uat deploy script, three models reviewed independently, and a finding counted when two of the three reached it. That review found a data-loss bug that the tests and a single review had missed, and the findings only one model reported were mostly noise. Three models on every pull request would cost more than most changes need. A reviewer per domain on every pull request still cost up to 11 agents and about 2.5 million input tokens on a high-risk change, much of it spent finding code and checking what tests and lint already check. So the review is scaled by risk, and each agent starts from its slice.

## Decision

- **No draft pull requests.** A pull request exists only when there is something to review.
- **While working,** the agent pushes the issue branch, CI runs on every push (CLA-0034), and the agent deploys dev by hand and verifies there (CLA-0029).
- **A multi-agent review before opening.** When CI is green and dev is verified, the agent runs `/claudalisk:review` on the branch.
  - A script plans the review, not a model. It maps the changed files to the knowledge skills' ADRs, decides whether the change is high-risk, and gives each agent only its slice of the diff and its ADRs. The review skill describes the mapping and the uat-data paths.
  - **ADR conformance:** one agent for every area the change touches, on the review model of CLA-0079.
  - **uat data safety,** when the change touches migrations, backups, restores or deploys: one agent on the review model.
  - **Correctness and security:** the built-in `/code-review`, at medium effort, or high on a high-risk change.
  - **A high-risk change** alters how uat data is backed up, restored, migrated or deployed, or touches security-relevant code. Its uat data safety review is a quorum of Opus, Sonnet and Haiku at medium effort, and a finding counts when two of the three reached it independently.
  - **What tools check is not reviewed.** While the architecture tests, the linters, the no-comments check and CI are green, no agent checks the rules they enforce.
  - **Findings are fixed or answered** before the pull request opens. A fix goes through the same loop: CI green and dev verified on the new head, then a review of only the domains whose files the fix changed.
- **Open when ready:** CI green on the branch head, the change verified on dev, and the review done.
- **The pull request reports the review:** the domains and models that reviewed it, each counted finding and what was done about it. A quorum domain lists the findings only one model reported separately, as optional.
- **The agent puts it on uat.** Once CI succeeded on the open pull request's head, the agent review-deploys that head (CLA-0030) and tells the owner which pull request and commit uat runs, and what to check.
- **The owner reviews on uat** with real data, and merges in GitHub when satisfied (CLA-0024). Nothing deploys after the merge, because uat already runs the merged tree (CLA-0030).
- **Changes after review** go through the same loop. When CI is green on the new head, the agent review-deploys it. The review runs again only for the domains the changes touch, and a change that makes the pull request high-risk gets the quorum before the deploy.

## Consequences

- The owner reviews the exact commit that will merge, running on real data.
- An open pull request always means "ready for review".
- A new or updated pull request replaces the one on uat. The agent says so when another awaits review.
- The owner sees what the agents found, and spends the uat review on behaviour.
- Most pull requests pay for one or two Opus reviewer agents and `/code-review`. Three models are spent only where a missed bug can lose real data.
