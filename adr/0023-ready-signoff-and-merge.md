# CLA-0023: Open the pull request when CI is green and dev is verified; the owner reviews on uat and merges

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** workflow
- **Enforced by:** CD (deploys only open pull requests whose CI succeeded); guardrail hook (the agent can't merge, CLA-0024)

## Context

Draft pull requests added a step: the owner, or the agent, had to click "Ready for review" before anything happened, and the draft state told the owner nothing an unopened pull request wouldn't. A pull request now exists only when there is something to review.

## Decision

- **No draft pull requests.**
- **While working,** the agent pushes the issue branch. CI runs on every push (CLA-0034). The agent verifies on dev, which it deploys by hand.
- **Open when ready.** The agent opens the pull request only when CI is green on the branch head and the change is verified on dev.
- **CD puts it on uat.** Opening the pull request makes CD deploy its head to dev and uat (CLA-0030). The agent then tells the owner which pull request and commit uat runs, and what to check.
- **The owner reviews on uat** with real data, and merges the pull request in GitHub when satisfied (CLA-0024).
- **After the merge,** CD deploys `main` to dev and uat.
- **Changes after review.** If the owner asks for changes, the agent pushes them. Once CI is green on the new head, CD puts it on uat.

## Consequences

- The owner always reviews the exact commit that will merge, running on real data.
- An open pull request always means "ready for review". There is nothing to click before reviewing.
- Opening or updating another pull request replaces the one on uat. The agent says so when it opens a pull request while another awaits review.
