# CLA-0078: Read files by range, and never re-read a file that has not changed

- **Status:** accepted
- **Date:** 2026-11-01
- **Area:** session-economy
- **Enforced by:** `implementer` agent; session-economy and code-standards skills; reviewer; Claude Code's own "File unchanged since last read" stub for a whole-file `Read`. No claudalisk hook (see Decision).
- **Issue:** #97

## Context

Every model request sends the whole conversation again (CLA-0073), and every file read stays in the context until the next compaction. Reading a whole file to find one method puts the whole file into every later request. Reading a file again that has not changed since the last read adds a second copy and tells the agent nothing new. After an `Edit` or `Write`, the tool result already shows the change, so reading the file again only to check the edit is a copy of what the agent just wrote.

Claude Code already tracks what each agent has read. A `Read` of a file that has not changed since that agent last read it returns a short "File unchanged since last read" stub instead of the content. Reading the file through `cat`, `sed` or `head` in Bash bypasses that tracking and returns the content again. The tracking is per agent: a subagent starts without the main thread's reads, so its first read of a file is a real read.

## Decision

- **Find before you read.** Use `Grep` (with `-n` and a few lines of context) or `Glob` to find the lines you need. Read the whole file only when it is short, about 300 lines or fewer, or when the task needs all of it.
- **Read large files by range.** Read a large file with `Read` and an `offset` and `limit` around the lines that `Grep` found, not the whole file.
- **Read with `Read`, not with Bash.** `cat`, `head`, `tail` or `sed -n` on a source file skips Claude Code's read tracking, so a repeat read returns the full content again.
- **Never re-read a file you just edited.** The `Edit` or `Write` result shows the change. If the edit failed, the error says so.
- **Never re-read a file that has not changed since you read it.** Refer to the earlier read. Read it again only when it has changed since then (a formatter, a script, a merge or the owner changed it), or when compaction has dropped the earlier read from the context.
- **Briefs name the lines.** When the main thread hands work to a subagent (CLA-0074), the brief names the files and the line ranges or symbols to change, so the subagent does not read whole files to find them.
- **No claudalisk guard hook.** A `PreToolUse` hook that blocks a `Read` of an unchanged file would mostly repeat Claude Code's own stub, which already covers a whole-file `Read` by the same agent. These are the two questions this issue left open:
  - **Key on the agent, not the session.** A subagent starts without the main thread's reads, so a guard keyed on the session would block a subagent's first, and needed, read of a file. Claude Code's stub is already per agent. Most repeat reads in one week of logs came from subagents (638 of 761). The fix for those is the brief that names the lines, and the subagent's own range reads, not a block.
  - **Warn, do not block.** After compaction or `/rewind`, the earlier read is gone from the context, but a modification-time check cannot know that. A block would then leave the agent unable to read a file it needs. Any future guard allows the read and adds a warning.
  - **A later hook goes with the router.** If the logs still show repeat reads once this rule is in place, the place for a guard is the plugin's hooks, which start with the session-start router (#12). That guard would warn on a whole-file read of a large file and on a Bash read (`cat`, `head`, `sed -n`) of a source file, since Claude Code's own tracking misses those. It would keep its state per agent and outside the checkout (CLA-0066), and it would be written in Node.js (CLA-0027).

## Consequences

- A file usually costs its relevant lines once per agent, not its whole length on every read.
- A subagent reads only what its brief points it to, so it adds a few hundred lines to its context, not every file it opens.
- The rule is prompt only for range reads and Bash reads. Claude Code's stub covers whole-file repeats with `Read`, but nothing stops a whole-file read of a large file or a `cat` of a source file until a guard hook exists.
- An agent that compacts mid-task may need to read a file again. That read is allowed, and compacting at milestones (CLA-0075) makes it rare.
