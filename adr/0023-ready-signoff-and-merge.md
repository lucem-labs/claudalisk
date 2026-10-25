# CLA-0023: Ready means CI green and verified on dev; the owner reviews on uat and merges

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** workflow
- **Enforced by:** CD (deploys only ready pull requests whose CI succeeded); guardrail hook (the agent can't merge, CLA-0024)

## Decision

- **Draft while working.** A pull request stays a draft while work continues. The agent verifies it on dev, which it deploys by hand.
- **Ready when green.** The agent marks it ready only when CI is green on its head and the change is verified on dev.
- **CD puts it on uat.** Marking it ready makes CD deploy that head to dev and uat (CLA-0030). The agent then tells the owner which pull request and commit uat runs, and what to check.
- **The owner reviews on uat** with real data, and merges the pull request in GitHub when satisfied (CLA-0024).
- **After the merge**, CD deploys `main` to dev and uat.
- **Changes after review.** If the owner asks for changes, the agent pushes them. CI and CD put the new head on uat once CI is green again.

## Consequences

- The owner always reviews the exact commit that will merge, running on real data.
- Readying another pull request replaces the one on uat. The agent says so when it marks a pull request ready while another awaits review.
