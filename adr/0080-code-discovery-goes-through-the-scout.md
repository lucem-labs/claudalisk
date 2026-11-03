# CLA-0080: Code search and discovery in the main thread go through the scout

- **Status:** accepted
- **Date:** 2026-11-03
- **Area:** session-economy
- **Enforced by:** the plugin's `scout-gate` hook (`hooks/scout-gate.mjs`, with its tests); `scout` agent; session-economy skill; reviewer
- **Issue:** #106

## Context

Every model request sends the whole conversation again (CLA-0073). Whatever the main thread searches and reads stays in its context and is paid for on every later turn. A subagent reads the same code in its own context and hands back a short answer, so the cost follows which model reads the code.

In a controlled experiment, with Opus leading every run on three coding tasks of increasing breadth, a Haiku subagent that did all searching and exploratory reading cut the cost of a task by 21% to 32% against the main thread doing it, and every result still passed its hidden tests. A Sonnet subagent cost more than a Haiku one and saved the main thread almost nothing.

Text search cannot find every use of a method whose receiver is not named at the call site, such as `copy.deepcopy(tags).items()`. A language server's `findReferences` on the method's definition finds them, because it resolves the receiver's type. While the server is still loading the workspace, the same call can return an incomplete list without any error.

## Decision

- **The main thread sends every code search and exploratory read to `claudalisk:scout`.** It asks one question, such as where something is defined, every place that uses a symbol, or how a flow works, and gets back paths, line numbers and the smallest excerpts needed.
- **The main thread reads code itself only to edit or check it.** It reads by range (CLA-0078) the lines it is about to edit, a file of about 300 lines or fewer, or its own edit when the tool result does not show it. A `Grep` of the one file it is about to edit counts as such a read.
- **The scout runs on Haiku at low effort, with `Read`, `Grep`, `Glob` and `LSP` only.** It never edits, and it answers in at most 300 words.
- **To find every use of a symbol, the scout uses `LSP`.** It runs `findReferences` on the symbol's definition, not on its class and not with `Grep`, repeats the call until the count stops changing, and reports every `path:line`. Without a language server for the file, it falls back to `Grep` and says the list may miss calls.
- **The plugin bundles no language server.** An app installs the official Claude Code LSP plugins for its languages, such as `csharp-lsp` for the backend and a TypeScript one for the frontend.
- **After a rename or a signature change, the compiler checks the result.** The verify script (CLA-0076) builds every project before the change is done, so a reference the scout missed fails there.
- **Subagents search for themselves.** The `implementer` keeps its own `Grep` and `Glob` (CLA-0074): its searches are part of the build, test and fix loop, not exploration.
- **A hook enforces this in the main thread.** The plugin's `PreToolUse` hook acts only on a tool call whose input has no `agent_id`, the field Claude Code adds when the call comes from a subagent. In the main thread it denies:
  - `Grep` across the project, unless its `path` is one file;
  - `Glob` in the project;
  - a whole-file `Read` of a file over 300 lines, unless it is an image or PDF;
  - shell commands that search or read project files, such as `grep`, `rg`, `git grep`, `find`, `ls -R`, `cat`, `head`, `sed -n`, `Select-String` and `Get-Content`.

  It allows a ranged `Read`, files outside the project (logs, the plugin's own ADRs), a `grep` that filters another command's output, and every command that reads no code. Each denial names the scout, or the ranged read, as the way through.
- **The hook blocks, unlike the warning CLA-0078 describes.** That warning protects a read the agent needs after compaction. Here there is always a way through, a ranged read or the scout, so a block costs one turn and never leaves the agent stuck.
- **`CLAUDALISK_SCOUT_GATE=off` turns the hook off** for a session, for example to measure without it. It is not a way around a denial.

## Consequences

- Exploration costs Haiku tokens in the scout's context, not Opus tokens in the main thread's, and the main thread keeps only the answer.
- A lookup the main thread could have done with one `Grep` now costs a scout round trip. Searching one file it is about to edit stays in the main thread.
- The scout can miss a reference. Its answer says whether a list came from `LSP` with a stable count or from text search, and the build catches what remains.
- A hook that cannot tell the main thread from a subagent would block the scout's own searches. The hook's tests cover both, and the check relies on Claude Code's `agent_id` field.
- The savings come from two runs per setup on three tasks. Re-measure on a few real claudalisk issues, and change the threshold or the denied commands if the logs show a need.
