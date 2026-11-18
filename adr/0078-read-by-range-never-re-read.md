# CLA-0078: Read files by range, and never re-read a file that has not changed

- **Status:** accepted
- **Date:** 2026-11-01
- **Area:** workflow
- **Enforced by:** `implementer` agent; workflow and code-standards skills; reviewer; Claude Code's own "File unchanged since last read" stub for a whole-file `Read`. No hook for repeat reads or shell reads.
- **Issue:** #97, #218

## Context

Every model request sends the whole conversation again (CLA-0073), and every file read stays in the context until the next compaction. Reading a whole file to find one method puts the whole file into every later request. Reading an unchanged file again adds a second copy. After an `Edit` or `Write`, the tool result already shows the change.

Claude Code tracks what each agent has read. A repeat `Read` of an unchanged file returns a short "File unchanged since last read" stub. Reading through `cat`, `sed` or `head` in Bash bypasses that tracking. The tracking is per agent, so a subagent's first read of a file is a real read.

## Decision

- **Find before you read.** Use `Grep` (with `-n` and a few lines of context) or `Glob` to find the lines you need. Read a whole file only when it is about 300 lines or fewer, or when the task needs all of it.
- **Read large files by range,** with `Read` and an `offset` and `limit` around the lines found.
- **Read with `Read`, not with Bash,** so that read tracking works.
- **Never re-read a file you just edited.** The `Edit` or `Write` result shows the change, and a failed edit says so.
- **Never re-read a file that has not changed since you read it.** Read it again only when a formatter, a script, a merge or the owner changed it, or when compaction dropped the earlier read.
- **Briefs name the lines.** A brief to a subagent (CLA-0074) names the files and the line ranges or symbols to change.
- **No hook for repeat reads.** Claude Code's stub already covers a whole-file `Read` by the same agent. Most repeat reads came from subagents, whose fix is a brief that names the lines. A guard would have to key on the agent, not the session, and warn rather than block, because after compaction or `/rewind` the agent may need the read again.
- **No hook for shell reads in subagents.** The #218 spike found their shell reads already ranged, and the part a ranged `Read` or `Grep`'s line cap would cut was under 0.1% of the implementer's output. A `sed -n` moved to `Read` grows by about 7% for its line numbers. Each denied call costs a request that resends the context, more than a gate could save. A later ADR revisits this if a spike by the same method finds the cuttable part, or repeat reads of unchanged files, above 5% of the implementer's tool output.
- A future read guard goes in the plugin's hooks, written in Node.js (CLA-0027), with its state per agent and outside the checkout (CLA-0066).

## Consequences

- A file usually costs its relevant lines once per agent, not its whole length on every read.
- A subagent reads only what its brief points it to.
- The range rule and the Bash rule are prompt only.
- An agent that compacts mid-task may need to read a file again. That read is allowed, and compacting at milestones (CLA-0073) makes it rare.
