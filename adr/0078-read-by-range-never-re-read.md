# CLA-0078: Read files by range, and never re-read a file that has not changed

- **Status:** accepted
- **Date:** 2026-11-01
- **Area:** workflow
- **Enforced by:** `implementer` and `scout` agents; workflow and code-standards skills; reviewer; Claude Code's own "File unchanged since last read" stub for a whole-file `Read`; in the main thread, the plugin's `scout-gate` hook (CLA-0080) for whole-file reads of large files and shell reads. No hook for repeat reads, and no hook for shell reads in subagents (see Decision).
- **Issue:** #97, #218

## Context

Every model request sends the whole conversation again (CLA-0073), and every file read stays in the context until the next compaction. Reading a whole file to find one method puts the whole file into every later request. Reading a file again that has not changed since the last read adds a second copy and tells the agent nothing new. After an `Edit` or `Write`, the tool result already shows the change, so reading the file again only to check the edit is a copy of what the agent just wrote.

Claude Code already tracks what each agent has read. A `Read` of a file that has not changed since that agent last read it returns a short "File unchanged since last read" stub instead of the content. Reading the file through `cat`, `sed` or `head` in Bash bypasses that tracking and returns the content again. The tracking is per agent: a subagent starts without the main thread's reads, so its first read of a file is a real read.

## Decision

- **Find before you read.** Use `Grep` (with `-n` and a few lines of context) or `Glob` to find the lines you need. Read the whole file only when it is short, about 300 lines or fewer, or when the task needs all of it. The main thread asks the `claudalisk:scout` agent instead (CLA-0080).
- **Read large files by range.** Read a large file with `Read` and an `offset` and `limit` around the lines that `Grep` found, not the whole file.
- **Read with `Read`, not with Bash.** `cat`, `head`, `tail` or `sed -n` on a source file skips Claude Code's read tracking, so a repeat read returns the full content again.
- **Never re-read a file you just edited.** The `Edit` or `Write` result shows the change. If the edit failed, the error says so.
- **Never re-read a file that has not changed since you read it.** Refer to the earlier read. Read it again only when it has changed since then (a formatter, a script, a merge or the owner changed it), or when compaction has dropped the earlier read from the context.
- **Briefs name the lines.** When the main thread hands work to a subagent (CLA-0074), the brief names the files and the line ranges or symbols to change, so the subagent does not read whole files to find them.
- **No claudalisk hook for repeat reads.** A `PreToolUse` hook that blocks a `Read` of an unchanged file would mostly repeat Claude Code's own stub, which already covers a whole-file `Read` by the same agent. These are the two questions this issue left open:
  - **Key on the agent, not the session.** A subagent starts without the main thread's reads, so a guard keyed on the session would block a subagent's first, and needed, read of a file. Claude Code's stub is already per agent. Most repeat reads in one week of logs came from subagents (638 of 761). The fix for those is the brief that names the lines, and the subagent's own range reads, not a block.
  - **Warn, do not block.** After compaction or `/rewind`, the earlier read is gone from the context, but a modification-time check cannot know that. A block would then leave the agent unable to read a file it needs. Any future guard allows the read and adds a warning.
  - **A later repeat-read guard goes in the plugin's hooks.** If the logs still show repeat reads once this rule is in place, a guard there would keep its state per agent and outside the checkout (CLA-0066), and it would be written in Node.js (CLA-0027).
- **In the main thread, a hook denies a whole-file read of a large file and a shell read of a project file** (CLA-0080). It needs no state, and a ranged `Read` or the scout is always a way through, so it blocks instead of warning.
- **No claudalisk hook for shell reads in subagents.** `scout-gate` allows every call that carries an `agent_id`, and it stays that way. The #218 spike measured the subagent runs since 2026-11-04 in the #212 sample, with each tool call counted once:
  - **The volume is real.** Shell reads (`sed -n`, `cat`, `head`, `tail`, `awk` on a file) are 34.4% of the implementer's tool output, about 25 calls a run, and shell searches over files are another 15.9%, about 22 calls a run, over 146 runs. (#212 and CLA-0095 give 32% for the shell reads, from a grouping by command family that counts some of these calls elsewhere.) In 228 general-purpose runs they are 25.2% and 14.6%. The scout and the reviewer have no shell and read only through `Read` and `Grep`.
  - **Steering would not shrink it.** The implementer's `sed -n` reads are already ranged. The part of its output that a ranged `Read` or `Grep`'s line cap would cut, whole-file `cat` past 300 lines, ranges past 300 lines and searches past 250 lines, is 0.06% of its output. Identical shell reads with no edit or other shell command between are 0.08%. Repeats are rare through `Read` as well: 43 subagent `Read` calls repeated the same file and range with no edit between. None of them came back as the "unchanged" stub, so the sample shows no saving from the stub that moving shell reads to `Read` would gain.
  - **`Read` is larger for the same lines.** Line-number prefixes are 6.3% of subagents' `Read` output, so a `sed -n` moved to `Read` grows by about 7%.
  - **A deny costs a request.** Each denied call is a model request that sends the whole context again, and the agent then makes the same read through another tool. An implementer run makes a median of 60 model requests and about 47 shell reads and searches, so one denial adds about 1.7% to the run's requests, more than the 0.1% a gate could save.
  - **Revisit with a later ADR** if a spike with the same method finds the part a ranged `Read` or `Grep` would cut, or repeat reads of unchanged files, above 5% of the implementer's tool output, or if the #202 benchmark shows a lower cost per accepted task with such a gate. Such a hook would reuse `hooks/shell.mjs`, deny only reads and searches of project files, and leave pipes over command output, `git` and `node` scripts alone, so the build, test and fix loop is never blocked.

## Consequences

- A file usually costs its relevant lines once per agent, not its whole length on every read.
- A subagent reads only what its brief points it to, so it adds a few hundred lines to its context, not every file it opens.
- In subagents the rule is prompt only for range reads and Bash reads, on purpose (#218). Their shell reads cost about what the same reads through `Read` would, and the code-intelligence tools in #200 target what they cost. Claude Code's stub covers whole-file repeats with `Read`; in the main thread the `scout-gate` hook (CLA-0080) also stops a whole-file read of a large file and a `cat` of a source file.
- An agent that compacts mid-task may need to read a file again. That read is allowed, and compacting at milestones (CLA-0075) makes it rare.
