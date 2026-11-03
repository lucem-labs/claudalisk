# CLA-0023: Open the pull request when CI is green, dev is verified and the review is done; the owner reviews on uat and merges

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** workflow
- **Enforced by:** the uat deploy script (deploys only open pull requests whose CI succeeded); guardrail hook (the agent can't merge, CLA-0024); guardrail hook on `gh pr create` (CI must be green on the head, #11); the claudalisk review skill (#53); reviewer
- **Issue:** #90

## Context

Draft pull requests added a step. Someone had to click "Ready for review" before anything happened, and the draft state told the owner nothing. A pull request now exists only when there is something to review.

Tests and the owner's review on uat still miss some bugs. In one change to the uat deploy script, three models reviewed the change independently, and a finding counted when two of the three reached it. That review found a data-loss bug that the tests and a single review had missed: a branch that fell behind `main` after its CI passed would have had `main`'s newer migrations counted as missing, and the deploy would have restored uat over recent data. All three models agreed on that fix and on six other findings. The findings only one model reported were mostly noise or minor. Three models on every pull request would cost more than most changes need, so the review is scaled by risk.

## Decision

- **No draft pull requests.**
- **While working,** the agent pushes the issue branch. CI runs on every branch push (CLA-0034). The agent deploys to dev by hand and verifies there. Nothing else deploys dev (CLA-0030), so dev runs what the agent last deployed.
- **A multi-agent review before opening.** When CI is green and dev is verified, the agent runs the claudalisk review skill on the branch (#53). Until the skill exists, the agent starts the same review agents itself.
  - **One agent per domain:** architecture (the ADRs of the areas the change touches), security, data and migrations, tests, and frontend. The files the branch changes choose the domains, so a change with no frontend files gets no frontend agent.
  - **Every pull request** gets its domain agents on one model, the review model of CLA-0079.
  - **A high-risk pull request** also gets three different models in its high-risk domains. It is high-risk when it changes how uat data is backed up, restored, migrated or deployed, or touches security-relevant code. There a finding counts when two of the three models reached it independently.
  - **Findings are fixed or answered** before the pull request opens. A fix goes through the same loop: CI green and dev verified on the new head.
- **Open when ready.** The agent opens the pull request only when CI is green on the branch head, the change is verified on dev and the review is done.
- **The pull request reports the review.** Its description lists the domains and models that reviewed it, each counted finding and what was done about it, fixed or why not. In a quorum domain, the findings only one model reported are listed separately as optional.
- **The agent puts it on uat.** Once the pull request is open and CI succeeded on its head, the agent review-deploys that head to uat (CLA-0030). The agent then tells the owner which pull request and commit uat runs, and what to check.
- **The owner reviews on uat** with real data. When satisfied, the owner merges the pull request in GitHub (CLA-0024).
- **After the merge,** nothing deploys. uat already runs the merged tree, because the branch contained `main` (CLA-0030, CLA-0034).
- **Changes after review.** If the owner asks for changes, the agent pushes them. When CI is green on the new head, the agent review-deploys it to uat. A change that adds a domain or makes the pull request high-risk gets that part of the review before the deploy.

## Consequences

- The owner reviews the exact commit that will merge, running on real data.
- An open pull request always means "ready for review". There is nothing to click before reviewing.
- A new or updated pull request replaces the one on uat. The agent says so when it opens a pull request while another awaits review.
- The owner sees in the pull request what the agents found and what was done about it, and spends the uat review on behaviour instead of on what a reviewer agent catches.
- Most pull requests pay for one model per touched domain. Three models are spent only where a missed bug can lose real data or open a hole.
- The quorum keeps single-model noise out of the counted findings, while the optional list still shows the owner what was left out.
