# CLA-0088: Code intelligence is native, deterministic, cross-platform, surface-independent and measured

- **Status:** accepted
- **Date:** 2026-11-15
- **Area:** workflow
- **Enforced by:** reviewer (CLA-0023); from the first tool on, its CI job on ubuntu, windows and macos; the benchmark in `spikes/code-intel-bench/`, whose own CI job runs its tests on the same three
- **Issue:** #201, #200, #202

## Context

Sessions spend most of their tokens finding, reading and changing code, and every model request sends the whole conversation again (CLA-0073). Code intelligence can cut that cost: tools that answer a question about the code in one call, and edit many sites in one call, instead of the model searching, reading and editing by hand. Epic #200 plans that work. Its sub-issues build tools and run spikes, and each one needs the same ground rules. This ADR records them. Every later issue in the epic cites it.

What claudalisk has today:

- Claude Code's `LSP` tool has nine read-only operations, all by file position: goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, goToImplementation, prepareCallHierarchy, incomingCalls and outgoingCalls. It has no rename, code action or formatting.
- The language servers behind it do more. `csharp-ls` advertises rename with prepare, call hierarchy, implementation and code actions. TypeScript 7's server (`tsc --lsp --stdio`) advertises rename with prepare, call hierarchy, file-rename edits and code actions such as organize imports and fix all.
- The `claudalisk:scout` reads code for the main thread (CLA-0080). In #106 it cut task cost by 21% to 32%. Giving it `LSP` as a general toolset changed little, but on a task where text search misses calls whose receiver is not named, `findReferences` was decisive: 2 of 2 runs correct, against 0 or 1 of 2.
- In #146 a re-read guard was not built, because the transcripts showed no repeat reads. Measuring first saved building something with no effect.

What the evidence in #200 shows:

- **Model-written answers make agents worse.** In a published benchmark of a local code-retrieval engine, a judge scored the agent's answers 7.60 with the retrieved evidence alone, 7.20 when a 1.5B local model wrote an answer from that evidence, and 7.00 with a 3B model. The local model's answers were shallow or wrong, and the agent anchored on them. The same project found its reranker net-negative on answer quality.
- **Several code assistants that built embedding search moved back to text search and agent exploration.**
- **A smaller tool output is not a cheaper session.** An output-compression tool's own documentation says that a 90% cut in output is not a 90% cut in cost. Cache reads, extra turns and rework decide what a task costs.
- **Some Claude Code features exist on some surfaces only.** Code Mode is experimental and off by default, needs an interactive terminal, and does not work with `claude -p`, the Desktop app or cloud sessions. The plugin's hooks, agents and MCP server were seen working in a Desktop session as they do in the CLI, and `claude -p` loads plugins unless it is started with `--bare`.
- **Reference tools are not a base to build on.** One runs only on macOS on one CPU family. Another is under a copyleft licence, which claudalisk, under MIT, cannot copy from. Claudalisk is developed on Windows, and apps' CI runs on Linux.
- **This repository is public, and the DinD runners refuse public repositories** (CLA-0086). They are Linux only.

## Decision

- **Claudalisk builds its own code-intelligence tools and depends on no external code-intelligence service.** The tools drive the language servers that CLA-0080 sets up, and parse files themselves. Other tools are compared with claudalisk's on the same fixtures. Where one does better, claudalisk rebuilds that behaviour against the LSP 3.17 specification and the servers' documented behaviour. It never copies copyleft code.
- **Claudalisk defines its own tool interface.** It does not mirror Claude Code's `LSP` tool, which is one client of the language servers, not a contract.
- **Tool output is deterministic evidence.** It holds language-server results, parsed file content and exact `path:line` locations, and once the language server has loaded the workspace, the same code and the same call give the same output. A tool waits for that itself, as N2 says, and never returns a partial list as if it were complete. It never holds embeddings, output from a local model, or a summary written by any model. A tool that cannot answer says so, and says what it did not cover, as the scout does today (CLA-0080).
- **The tools run on Windows, Linux and macOS.**
  - Claudalisk's own tests prove it on GitHub-hosted ubuntu, windows and macos runners, because this repository is public and the DinD runners refuse it.
  - When a generated app's CI needs a binary these tools use, such as a language server, the binary goes into the DinD runner image in `lucem-labs/github-runner-dind`, and apps pick it up through the `RUNNER_IMAGE` pin (CLA-0086). It is never installed per job.
- **Every feature works in the CLI, the Desktop app and `claude -p`.** It ships as plugin parts that every surface loads, such as hooks, agents, MCP servers and LSP servers. Nothing depends on a Claude Code feature that only some surfaces have, such as Code Mode. If the interface spike picks a code-execution style of calling tools, claudalisk builds its own.
- **A change is accepted only on measurement.** A code-intelligence change is accepted when the benchmark shows that cost per accepted task drops, or holds while correctness rises. Token counts per call and output sizes are not evidence on their own. A loop guard or tool-output compression is built only if a transcript spike first shows that the waste exists, as #146 did.
  - **The measuring instrument is `spikes/code-intel-bench/`.** It generates a pinned fixture app, gives an agent each of seven tasks in a fresh copy, runs hidden tests the agent never sees, and records cost, tokens, turns, subagents, wall time and the hidden-test result of every run. An arm is a plugin directory, a settings file and a list of models. The baseline is the plugin at the current commit. The baseline and every arm run on both `claude-opus-5-5` and `claude-sonnet-5-5`, and each model is reported and judged on its own, never pooled. Every run passes `--setting-sources project,local`, so the settings and plugins of the user who runs it never reach a measured run, and each run's record holds its arguments.
  - **The unit of comparison is the repeat:** one pass over the seven tasks. Each arm and the baseline run 3 repeats. A repeat's cost per accepted task is its total cost divided by the number of its runs that passed, and is infinite when none passed. A run that exceeds its budget counts as failed, with its cost.
  - **An arm is compared with the baseline on the same model.** The rules below give one verdict per model.
  - **An arm lowers cost only when both hold.** Separation: every one of its 3 repeats costs less per accepted task than every one of the baseline's 3. With no real difference all 6 orderings are equally likely, so full separation happens by chance 1 time in 20, a 5% false-positive rate that assumes no distribution. Size: its mean cost per accepted task is at least 10% below the baseline's.
  - **An arm holds cost while correctness rises** when its mean cost per accepted task is not above the baseline's highest repeat, it passes at least 2 more of the 21 runs, and no task passes fewer runs than in the baseline.
  - **Anything else is no effect, and the change is not accepted.** The harness stops starting runs when the next run's cap would take the total spend past $150. The spend is kept in one ledger per machine, outside any checkout, so every worktree and session shares the cap, and each run reserves its cap before it starts, so a run that never ends stays charged.
- **The catalogue below lists what code intelligence means here, with a decision for each feature.** Ids are stable: a later ADR amends a row by its id, and an id is never renumbered or reused. A new feature takes the next free number in its letter's group. "Build" means build it and keep it if it passes the benchmark. "Spike" means a code experiment decides first. The savings it targets are:
  - **turns:** fewer model round trips;
  - **reads:** less file content in context;
  - **cycles:** fewer build or CI loops;
  - **misses:** fewer wrong or incomplete changes that need rework.

| ID | Feature | Claudalisk today | Saving | Decision |
|---|---|---|---|---|
| N1 | Definition, declaration, type definition | `LSP` tool, by position | turns | Rebuild by symbol name |
| N2 | Find references, grouped and filtered, with the wait for a stable count inside the tool | the scout repeats `LSP` calls itself | turns, misses | Build |
| N3 | Implementations | `LSP` tool | turns | Build |
| N4 | Call hierarchy, incoming and outgoing | `LSP` tool | turns | Build |
| N5 | Type hierarchy | none | turns | Spike: server support |
| N6 | Workspace symbol search by name | `LSP` tool | turns | Build, as the entry point to N1 to N5 |
| U1 | Compact symbol outline of a file or folder | `LSP` documentSymbol | reads | Build |
| U2 | Public API of a module or slice, from claudalisk's conventions (Interfaces projects, FSD `index.ts`) | none | reads | Spike, with I1 |
| U3 | Hover and signature | `LSP` tool | reads | Keep, through the host (X1) |
| U4 | Ranked repo map injected at session start | none | reads | Not now: it conflicts with loading context lazily (#1), and the scout covers orientation |
| S1 | Text and regex search | `Grep` | — | Exists |
| S2 | Embedding or semantic search | none | — | No: tool output stays deterministic, and code assistants that built it moved back to text search |
| S3 | Structural search and replace | none | turns | Not now: no evidence of need |
| E1 | Rename a symbol (prepare, then rename, overloads included) | none: the model edits each site by hand | turns, reads, misses | Build |
| E2 | Rename or move a file or type, with imports and namespaces updated | none | turns, misses | Build if the host spike proves it |
| E3 | Change signature | none | turns, misses | Spike: whether the servers offer it as a code action |
| E4 | Replace a symbol's body, or insert before or after a symbol, without reading the whole file first | none | reads | Build |
| E5 | Safe delete, which checks references first | none | misses | Build |
| E6 | Code actions: organize imports, fix all, quick fixes | none | cycles | Build the kinds the servers offer |
| E7 | Extract, inline and move refactorings | none | turns | Spike: build only what the servers return |
| D1 | Diagnostics pushed after each edit | the LSP plugins (CLA-0080) | cycles | Keep; a spike decides who hosts it |
| D2 | Diagnostics on demand for a file or symbol | none | cycles | Build |
| I1 | Cross-language impact: a C# DTO or endpoint, then OpenAPI, then `schema.d.ts`, then React | none | misses, turns | Spike |
| I2 | The tests a change affects | CI runs everything (CLA-0034) | cycles | Not now: CI is the only verifier (CLA-0076), and waiting costs one call (CLA-0077) |
| X1 | A live language-server host per worktree | Claude Code's `LSP` tool and the LSP plugins (CLA-0080) | — | Build |
| X2 | A persistent precise index on disk | none | turns (cold start) | Only if the host spike's cold-start numbers call for it |
| X3 | Memories or learned facts across sessions | ADRs, `AGENTS.md`, handoff notes | turns, reads | A later phase |

- **ADRs about code intelligence name no other products.** They describe evidence in plain terms, such as "a published benchmark of a local code-retrieval engine", and link the issue that holds the sources. Language servers and Claude Code features may be named.

## Consequences

- Claudalisk writes and maintains tools that it could have taken from elsewhere. Implementation effort is not the constraint here; session cost is, and the benchmark decides.
- A feature that looks useful can still fail the benchmark and be dropped. Embedding search and a session-start repo map are out unless new evidence comes in, through an ADR that amends S2 or U4.
- Each tool's CI job runs three times, once per operating system, so a bug that shows on one of them fails CI before it reaches an app.
- Adding a binary for apps' CI is a change in `lucem-labs/github-runner-dind` and a pin bump in each `runners.env`, not a line in every app's workflow.
- A surface-limited Claude Code feature can be cheaper on one surface and still not be used. Claudalisk builds its own equivalent instead.
- The benchmark has a budget of about $150 in total, so each result rests on a few runs per setup, and the noise rule in the decision tells a drop from noise.
- The spikes in #200 record their decisions as ADRs CLA-0089 to CLA-0096, each amending the rows it settles.
- The ADRs carry no product names, so a reader who wants a source follows the `Issue:` link to #200 or #201.
