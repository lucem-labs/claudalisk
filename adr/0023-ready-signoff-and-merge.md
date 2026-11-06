# CLA-0023: Open the pull request when CI is green, dev is verified and the review is done; the owner reviews on uat and merges

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** workflow
- **Enforced by:** the uat deploy script (deploys only open pull requests whose CI succeeded); guardrail hook (the agent can't merge, CLA-0024); guardrail hook on `gh pr create` (CI must be green on the head, CLA-0083); the claudalisk review skill (`/claudalisk:review`) and its plan script (`tools/review-plan.mjs`); reviewer
- **Issue:** #90, #127, #53

## Context

Draft pull requests added a step. Someone had to click "Ready for review" before anything happened, and the draft state told the owner nothing. A pull request now exists only when there is something to review.

Tests and the owner's review on uat still miss some bugs. In one change to the uat deploy script, three models reviewed the change independently, and a finding counted when two of the three reached it. That review found a data-loss bug that the tests and a single review had missed: a branch that fell behind `main` after its CI passed would have had `main`'s newer migrations counted as missing, and the deploy would have restored uat over recent data. All three models agreed on that fix and on six other findings. The findings only one model reported were mostly noise or minor. Three models on every pull request would cost more than most changes need, so the review is scaled by risk. A reviewer per domain on Opus, on every pull request and again after every fix, still cost up to 11 agents and about 2.5 million input tokens on a high-risk change, much of it spent finding the right code and checking what tests and lint already check.

## Decision

- **No draft pull requests.**
- **While working,** the agent pushes the issue branch. CI runs on every branch push (CLA-0034). The agent deploys to dev by hand and verifies there. Nothing else deploys dev (CLA-0030), so dev runs what the agent last deployed.
- **A multi-agent review before opening.** When CI is green and dev is verified, the agent runs the claudalisk review skill, `/claudalisk:review`, on the branch.
  - **A script plans the review, not a model.** It maps the changed files to the knowledge skills' areas and their ADRs, decides whether the change is high-risk, and gives each agent only its slice of the diff and its ADRs.
  - **uat data** paths are the migrations, the deploy, init, backup, restore and refresh scripts, the uat Compose file, the agent's deny list and hooks, and any change to the `@claudalisk/scripts` version in a `package.json`, since a bump changes deploy and restore behaviour with no script in the diff. An app adds its own, and its security-relevant paths, in `.claude/claudalisk.json`.
  - **ADR conformance:** one agent for every area the change touches, on the review model of CLA-0079.
  - **uat data safety,** when the change touches migrations, backups, restores or deploys: one agent on the review model.
  - **Correctness and security:** the built-in `/code-review`, at medium effort, and high on a high-risk change.
  - **A high-risk pull request** changes how uat data is backed up, restored, migrated or deployed, or touches security-relevant code. Its uat data safety review is a quorum of Opus, Sonnet and Haiku at medium effort, and a finding counts when two of the three reached it independently.
  - **What tools check is not reviewed.** While the architecture tests, the linters, the no-comments check and CI are green, no agent checks the rules they enforce.
  - **Findings are fixed or answered** before the pull request opens. A fix goes through the same loop: CI green and dev verified on the new head, and a review of only the domains whose files the fix changed, on the new diff.
- **Open when ready.** The agent opens the pull request only when CI is green on the branch head, the change is verified on dev and the review is done.
- **The pull request reports the review.** Its description lists the domains and models that reviewed it, each counted finding and what was done about it, fixed or why not. In a quorum domain, the findings only one model reported are listed separately as optional.
- **The agent puts it on uat.** Once the pull request is open and CI succeeded on its head, the agent review-deploys that head to uat (CLA-0030). The agent then tells the owner which pull request and commit uat runs, and what to check.
- **The owner reviews on uat** with real data. When satisfied, the owner merges the pull request in GitHub (CLA-0024).
- **After the merge,** nothing deploys. uat already runs the merged tree, because the branch contained `main` (CLA-0030, CLA-0034).
- **Changes after review.** If the owner asks for changes, the agent pushes them. When CI is green on the new head, the agent review-deploys it to uat. The review runs again only for the domains the new changes touch, and a change that makes the pull request high-risk gets the quorum before the deploy.

## Consequences

- The owner reviews the exact commit that will merge, running on real data.
- An open pull request always means "ready for review". There is nothing to click before reviewing.
- A new or updated pull request replaces the one on uat. The agent says so when it opens a pull request while another awaits review.
- The owner sees in the pull request what the agents found and what was done about it, and spends the uat review on behaviour instead of on what a reviewer agent catches.
- Most pull requests pay for one or two Sonnet agents and `/code-review`. Three models, Opus among them, are spent only where a missed bug can lose real data.
- Each agent starts with its diff and its ADRs, so it spends its turns checking, not searching.
- The quorum keeps single-model noise out of the counted findings, while the optional list still shows the owner what was left out.
