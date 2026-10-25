# CLA-0021: All work is issue-driven

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** workflow
- **Enforced by:** work-issue skill (planned); reviewer

## Decision

- Every change starts from a GitHub issue. An issue labelled `needs-design-review` is designed before any branch is started.
- One issue gives one branch, in a worktree off an up-to-date `origin/main`, or off the parent issue's branch for stacked work (CLA-0025).
- One branch gives one pull request that closes the issue. It is opened only when the work is ready for review, and is never a draft (CLA-0023).
- Docs and the touched sections of the app's `AGENTS.md` are updated in the same pull request.
- Decision changes are recorded as issue comments.
- Issues use the sections "Depends on", "Goal", "Design" and "Acceptance criteria".

## Consequences

- Every change has a reason and a review trail.
