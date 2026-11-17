# CLA-0080: Code search and discovery in the main thread go through the scout

- **Status:** accepted
- **Date:** 2026-11-03
- **Area:** workflow
- **Enforced by:** the plugin's `scout-gate` hook (`hooks/scout-gate.mjs`, with its tests); `scout` agent; workflow skill; reviewer
- **Issue:** #106, #196, #198

## Context

Every model request sends the whole conversation again (CLA-0073). Whatever the main thread searches and reads stays in its context and is paid for on every later turn. A subagent reads the same code in its own context and hands back a short answer, so the cost follows the model that reads the code.

In a controlled experiment on three coding tasks, with Opus leading every run, a Haiku subagent that did all searching and exploratory reading cut the cost of a task by 21% to 32%, and every result still passed its hidden tests. A Sonnet subagent cost more and saved the main thread almost nothing (#106).

Text search cannot find every use of a method whose receiver is not named at the call site. A language server's `findReferences` on the definition does, because it resolves the receiver's type. While the server is still loading the workspace, the same call can return an incomplete list without an error.

## Decision

- **The main thread sends every code search and exploratory read to `claudalisk:scout`.** It asks one question, such as where something is defined, every place that uses a symbol, or how a flow works. It gets back paths, line numbers and the smallest excerpts needed.
- **The main thread reads code itself only to edit or check it.** It reads by range (CLA-0078) the lines it is about to edit, a file of about 300 lines or fewer, or its own edit when the tool result does not show it. A `Grep` of the one file it is about to edit counts as such a read.
- **The scout runs on Haiku at low effort, with `Read`, `Grep`, `Glob` and `LSP` only** (CLA-0079). It never edits, and it answers in at most 300 words.
- **To find every use of a symbol, the scout uses `LSP`.** It runs `findReferences` on the symbol's definition and repeats the call until the count stops changing. It reports every `path:line`, and says whether the list came from `LSP` or, without a language server for the file, from `Grep`, which may miss calls. The language servers come from the LSP plugins of CLA-0092.
- **After a rename or a signature change, the compiler checks the result.** The verify script (CLA-0076) builds every project, so a reference the scout missed fails there.
- **Subagents search for themselves.** The implementer keeps its own `Grep` and `Glob` (CLA-0074), because its searches are part of the build, test and fix loop.
- **A hook enforces this in the main thread.** The plugin's `PreToolUse` hook acts only on tool calls without an `agent_id`, the field Claude Code adds to a subagent's calls. It denies:
  - `Grep` across the project, unless its `path` is one file;
  - `Glob` in the project;
  - a whole-file `Read` of a file over 300 lines, unless it is an image or PDF;
  - shell commands that search or read project files, such as `grep`, `rg`, `git grep`, `find`, `ls -R`, `cat`, `head`, `sed -n`, `Select-String` and `Get-Content`.

  It allows a ranged `Read`, files outside the project, a `grep` over another command's output, and every command that reads no code. Each denial names the scout, or the ranged read, as the way through.
- **The hook blocks.** CLA-0078's warning protects a read that an agent needs after compaction. Here a ranged read or the scout is always a way through, so a block costs one turn and never leaves the agent stuck.
- **`CLAUDALISK_SCOUT_GATE=off` turns the hook off** for a session, for example to measure without it. It is not a way around a denial.

## Consequences

- Exploration costs Haiku tokens in the scout's context, not Opus tokens in the main thread's, and the main thread keeps only the answer.
- A lookup the main thread could have done with one `Grep` now costs a scout round trip.
- The scout can miss a reference. Its answer says where the list came from, and the build catches the rest.
- The hook relies on Claude Code's `agent_id` field. Its tests cover the main thread and subagents, so it never blocks the scout's own searches.
- The savings come from two runs per setup on three tasks. Re-measure on real claudalisk issues, and change the threshold or the denied commands if the logs show a need.
