# CLA-0073: One session works on one issue, compacts at milestones, and hands over through a note on the issue

- **Status:** accepted
- **Date:** 2026-11-01
- **Area:** workflow
- **Enforced by:** workflow skill (prompt only for compaction); session-start hook pointer (CLA-0085); reviewer
- **Issue:** #92, #94

## Context

Every model request sends the whole conversation again, so the cost of a request grows with the context. A session that carries on from one issue to the next keeps growing until each request sends hundreds of thousands of tokens, most of them about finished work. Compaction replaces the conversation with a summary, but automatic compaction runs only when the window is almost full, after the most expensive requests. Compacting mid-task drops the working detail the task still needs, such as the failing test output or the lines being changed.

## Decision

- **One session works on one issue** (CLA-0021), in that issue's worktree. Start a new session, or run `/clear`, before the next issue. Never compact into a new issue: its summary would be context the next issue does not need.
- **Compact after a milestone, never mid-task.** A milestone is a point where the working detail is no longer needed: green build and tests, an opened pull request, a settled design question, or an implementer report (CLA-0074) reviewed and committed.
- **Compact by about 40% of the context window.** Use the first milestone after the context passes about 30%. The threshold is a share of the window, not a token count, because windows differ between models and Claude Code reports context as a share. Never wait for automatic compaction. Give `/compact` a focus: the issue, the branch, what is done, the next step and open decisions.
- **Hand over** when the working day ends with the issue open, when the pull request opens (CLA-0023), when the issue is blocked on the owner or another issue, or when the context passes about half of the window and work remains.
- **To hand over, post a handoff note as a comment on the issue,** then stop:

  ```markdown
  ## Handoff

  - **Branch:** `<branch>` in `<worktree path>`
  - **Pull request:** #<n>, or none yet
  - **State:** what is done, and what CI and dev show now
  - **Decisions:** choices made since the issue was written, each with its reason
  - **Next:** the next concrete step
  - **Open:** questions for the owner, or none
  ```

- **The next session starts from the issue,** its comments and the branch, and reads the latest handoff note first. It does not resume the old conversation.
- A handoff note holds no secrets and no real data (CLA-0026).

## Consequences

- Each session starts with a small context, and most requests run under about 40% of the window.
- The handoff notes are a record of progress that the owner can read on the issue. Work across several issues is coordinated through the issues, not one long conversation.
- A new session reads the issue and the touched files again, which costs much less than resending an old conversation with every request.
- Nothing measures the context for the agent. The rule relies on the agent checking it at each milestone.
