# CLA-0073: One session works on one issue, and hands over through a note on the issue

- **Status:** accepted
- **Date:** 2026-11-01
- **Area:** session-economy
- **Enforced by:** session-economy skill; reviewer
- **Issue:** #92

## Context

Every model request sends the whole conversation again, so the cost of a request grows with the size of the context. A session that carries on from one issue to the next keeps growing until each request sends hundreds of thousands of tokens, most of them about work that is already finished. Compaction shrinks the context, but it keeps a summary of everything before it, and it often runs only when the context window is almost full.

## Decision

- **One session works on one issue** (CLA-0021), in that issue's worktree. Start a new session, or run `/clear`, before work on the next issue.
- **A session hands over** when:
  - the working day ends with the issue still open;
  - the pull request is opened (CLA-0023);
  - the issue is blocked on the owner or on another issue;
  - the context is past about half of the window and work remains.
- **To hand over, the agent posts a handoff note as a comment on the issue,** then stops. The note uses this template:

  ```markdown
  ## Handoff

  - **Branch:** `<branch>` in `<worktree path>`
  - **Pull request:** #<n>, or none yet
  - **State:** what is done, and what CI and dev show now
  - **Decisions:** choices made since the issue was written, each with its reason
  - **Next:** the next concrete step
  - **Open:** questions for the owner, or none
  ```

- **The next session starts from the issue,** its comments and the branch. It reads the latest handoff note first. It does not resume the old conversation.
- A handoff note holds no secrets and no real data (CLA-0026).

## Consequences

- Each session starts with a small context, so its requests stay cheap.
- The handoff notes are a record of progress that the owner can read on the issue.
- Work across several issues, such as an epic, is coordinated through the issues and not through one long conversation.
- A new session reads the issue and the touched files again. That costs much less than sending an old conversation again with every request.
