# CLA-0021: All work is issue-driven

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** workflow
- **Enforced by:** work-issue skill (planned); reviewer

## Decision

- Every change starts from a GitHub issue. Design an issue labelled `needs-design-review` before you start any branch.
- One issue gives one branch. Make it in a worktree off an up-to-date `origin/main`, or off the parent issue's branch for stacked work (CLA-0025, proposed).
- One branch gives one pull request that closes the issue. Open it only when the work is ready for review. It is never a draft (CLA-0023).
- Update the docs and the touched sections of the app's `AGENTS.md` in the same pull request.
- Record decision changes as issue comments.
- Issues use the sections "Depends on", "Goal", "Design" and "Acceptance criteria".

## Consequences

- Every change has a reason and a review trail.
