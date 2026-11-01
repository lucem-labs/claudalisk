# CLA-0075: Compact at task boundaries, by about 40% of the context window

- **Status:** accepted
- **Date:** 2026-11-01
- **Area:** session-economy
- **Enforced by:** session-economy skill (prompt only)
- **Issue:** #94

## Context

Every model request sends the whole conversation again (CLA-0073). Compaction replaces the conversation with a summary of a few tens of thousands of tokens, so every request after it is cheaper. Left alone, compaction runs only when the context window is almost full, and by then most requests have already been sent at a large context. Compacting in the middle of a task has the opposite problem: the summary drops the working detail the task still needs, such as the failing test output or the exact lines being changed.

Context windows differ between models, from 200k tokens to 1M. A fixed token count that suits one model is past the whole window of another.

## Decision

- **Compact after a milestone, not mid-task.** A milestone is a point where the working detail is no longer needed:
  - the build and tests are green;
  - the pull request is opened;
  - a design question is settled;
  - an implementer report (CLA-0074) has been reviewed and committed.
- **Compact by about 40% of the context window.** Use the first milestone after the context passes about 30%, and do not let it pass about 40%. The threshold is a share of the window, not a token count, because windows differ between models and Claude Code reports context as a share of the window.
- **Never wait for automatic compaction.** Reaching it means the session has already sent its most expensive requests.
- **Give `/compact` a focus:** the issue, the branch, what is done, the next step and any decisions still open, so the summary keeps what the rest of the issue needs.
- **If the next step is a new issue, start a new session or run `/clear` instead of compacting** (CLA-0073). A summary of a finished issue is context the next issue does not need.
- **If the context passes about 40% with no milestone in sight,** finish the current step and compact there. If it passes about half of the window and work remains, hand over through a note on the issue (CLA-0073).

## Consequences

- Most requests run at under about 40% of the window, so the many requests after each milestone cost far less.
- Compaction happens where little working detail is lost, so the session does not need to read files again to recover it.
- On a 1M window, 40% is still about 400k tokens. The milestones, the implementer subagent (CLA-0074) and one session per issue (CLA-0073) usually keep the context well below that.
- Nothing measures the context for the agent yet. The rule relies on the agent checking the context at each milestone.
