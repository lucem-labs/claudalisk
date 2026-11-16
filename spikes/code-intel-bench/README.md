# Code intelligence benchmark

The measuring instrument of CLA-0088. It answers one question: does a change to claudalisk's plugin lower the **cost per accepted task** of a coding session on a claudalisk app, or hold it while correctness rises?

It is plain Node.js (`.mjs`, no dependencies) and runs on Windows, Linux and macOS. Its unit tests need no login, no dotnet and no network; run them locally, since spikes have no CI job.

## What it measures

Seven tasks run against one pinned fixture app. Each run is a fresh `claude -p` session in a fresh copy of the fixture. After the agent stops, the runner copies the task's hidden tests into the copy and runs the task's checks. A run is **accepted** when the session finished without error (a run that exceeds its budget counts as failed, with its cost) and every check exits 0.

| Task | What it asks | Features it stresses (#200 catalogue) |
|---|---|---|
| T1 | Rename a domain command across its module, its Interfaces project, another module and the tests | E1 |
| T2 | Rename a DTO property end to end: C#, the OpenAPI document, `schema.d.ts`, the React consumers | E1, I1 |
| T3 | Change an interface method signature and all its implementations and callers | E3, N3 |
| T4 | Rename an exported TypeScript entity function across four FSD slices | N2 |
| T5 | Answer "what calls `ILedger.Record`" where text search over-matches and the receiver is not named at the call site | N2, N4 |
| T6 | Replace one method body in a 250-line file | E4 |
| T7 | A control feature that needs no symbol work | none |

For every run it records, into `results/<arm>/<model>/<timestamp>-<task>-<repeat>.json`: the arm, the model, the run settings (`settingSources` and the exact `claude` argument list), the task, the repeat number (numbered per arm and model), the claudalisk commit and the fixture HEAD, `total_cost_usd`, the usage of every model (input, output, cache read and cache creation tokens, subagents included), turns, the number of subagents, wall time, `is_error` and the result subtype, and the result of each hidden check.

`bench.mjs` runs `claude` with `--output-format stream-json --verbose`, not `--output-format json`. The final `result` event of the stream carries the same fields as the single JSON result (`total_cost_usd`, `modelUsage`, `num_turns`, `is_error`, `subtype`), and the stream also shows every `Agent` or `Task` tool use, which is how subagents are counted. `--bare` is never used, because it skips hooks, and the plugin's hooks are part of what is measured. The prompt goes to `claude` on stdin, so it needs no shell quoting on any system.

## The fixture

```
node spikes/code-intel-bench/fixture.mjs build <folder>
```

It generates an app with `generateApp()` exactly as `tools/check-new-app.mjs` does (root `Bench`, module `Ordering`, aggregate `Order`, no skill, the registry served from `registry/public/r`, the packed `@claudalisk/scripts`, a fixed `now` and git identity so the output is deterministic). It adds a second module, `Billing` with the aggregate `Invoice`, as the `backend-scaffold` CI job does, applies the committed overlay in `fixture/overlay/`, and commits. It writes `fixture.json` (not committed: it holds a local path) with the claudalisk commit it was generated from and the fixture's HEAD.

The overlay adds what the tasks need: Billing calling Ordering through its Interfaces project (`RaiseInvoiceHandler`); discount policies behind an interface (T3); a ledger and an audit trail whose `Record` methods have the same name and parameters, with calls through fields, properties, delegates, lazy values and locals (T5); a large formatting class (T6); and a frontend `order` entity used by two features, a widget and two pages (T2, T4). The app's own tests still pass with it.

Every run gets `git clone` of the fixture into a temporary folder outside the repository and checks that its HEAD is the pinned one. The fixture's `frontend/node_modules` is copied into the copy, so a run does not reinstall packages and cannot change the fixture's.

## Run the baseline

```
node spikes/code-intel-bench/fixture.mjs build ../claudalisk-bench-fixture
node spikes/code-intel-bench/bench.mjs run --arm baseline --dry-run
node spikes/code-intel-bench/bench.mjs run --arm baseline --runs 3
node spikes/code-intel-bench/bench.mjs report --arm baseline
```

`--tasks T1,T2` runs a subset. Runs go one pass over the tasks at a time, so an interrupted run leaves complete repeats. Every step in one pass has the same repeat number, and each record stores it as `repeat`. A pass takes the lowest repeat number that at least one of the selected tasks lacks in `results/<arm>/`, and runs only the tasks that lack it, so `--tasks T5` re-runs T5 into the lowest repeat it is missing from, and a full run continues after the last repeat. The ledger entry is settled and a partial record (`checksPending: true`) is written as soon as `claude` ends, before the hidden checks, and the record is completed after them. A run with no result event (timeout, crash, kill) is charged the run cap and its record has `costEstimated: true`, so the budget guard never under-counts.

The baseline arm is `arms/baseline/arm.json`: this repository's plugin at its current commit, `settings.json` and the models `claude-sonnet-5-5` and `claude-opus-5-5`. To test a change, add `arms/<name>/arm.json` with the plugin directory (a path relative to the arm folder), a settings file and a model, and run it the same way. The runner does not change. The plugin directory is staged into a temporary copy that leaves out `spikes/` and `.git`, so the agent can never read the hidden tests or the reference solutions.

An arm may add five optional fields to `arm.json`:

- `include`: paths relative to `pluginDir` that are staged although they sit under a left-out folder, for example `spikes/code-intel` and `spikes/lsp-host`. `spikes/code-intel-bench` and `.git` stay out whatever `include` says, so the hidden tests and the references are never staged.
- `overlay`: a folder relative to the arm folder. Its files are copied over the staged plugin after staging, so an arm can replace `.mcp.json` or add `skills/<name>/SKILL.md`. In the overlay's `.md` files the token `${CLAUDE_PLUGIN_ROOT}` is replaced by the absolute path of the staged plugin (forward slashes), so a skill's command line works from the fixture's folder without relying on Claude Code to substitute the token in skill text. Other overlay files, such as `.mcp.json`, keep the token, which Claude Code resolves for MCP servers.
- `toolPattern`: a regular expression. The run record gains `codeIntelCalls`, the number of distinct `tool_use` blocks whose tool name matches it, or, for `Bash`, whose command matches it. The report shows a `Code-intel calls` column when any record has the count.
- `agents`: changes to the plugin's own agent files, applied to the staged copy so the arm tracks the plugin: `{ "scout": { "addTools": [...], "note": "<file>" } }`. `addTools` appends to the `tools:` line of `agents/<name>.md`; the entry `${mcpTools}` expands to the MCP tools of the staged interface, named `mcp__plugin_<plugin name>_<server name>__<tool>` from `.claude-plugin/plugin.json`, `.mcp.json` and the interface's `tools.mjs`. `note` is a file relative to the arm folder, without its frontmatter, appended to the agent as a `## Code intelligence` section, with `${CLAUDE_PLUGIN_ROOT}` replaced by the staged path and `${mcpTools}` by the tool names. Every change is listed in the record as `agentChanges`. The `*-mcp` arms give both agents the MCP tools and a note; the `*-cli` arms append the CLI skill text to both agents and give the scout `Bash`, which the baseline scout (`Read, Grep, Glob, LSP`) does not have, so a cli arm's scout is also able to run commands.
- `hooks`: a list of `{ "script": "<file>", "matcher": "<tool regex>", "args": [...] }`. Each script (a path relative to the arm folder) is copied to `hooks/arm/` in the staged plugin and appended to the `PreToolUse` array of the staged `hooks/hooks.json` as `node "${CLAUDE_PLUGIN_ROOT}/hooks/arm/<script>" <args>`; `${CLAUDE_PLUGIN_ROOT}` inside `args` is replaced by the staged path. The record lists them as `hookChanges`. When an arm has hooks, the runner sets `CODE_INTEL_BENCH_HOOK_LOG` to a file in the run's temporary folder, and a hook may append one JSON line per decision to it; the record gains `scoutBashDecisions: { allowed, denied, unknownAgent }` counted from that file.

`agents` and `hooks` stay generic on purpose, so #206 can reuse them with other caller sets: nothing in them names the scout or the code-intel interfaces except the arm files themselves.

Every run's raw stream-json is kept in `results/<arm>/<model>/<timestamp>-<task>-<repeat>.stream.jsonl` (git-ignored); the record's `stream` points at it. `codeIntelCalls` counts calls inside subagent messages too. `report --arm <name>` also works for an arm that has records but no arm folder, such as the relabelled `b-mcp-idle`; `run` refuses it.

`CLAUDE_BIN` names the `claude` executable (default `claude`); a path ending in `.mjs` runs with Node, which is how the tests use `test/fake-claude.mjs`.

The agent has to be logged in on the machine that runs the benchmark. Runs pass `--setting-sources project,local`, so that the user's own settings and plugins (the user source) never reach a measured run and two machines or two users measure the same thing; every record stores `settingSources` and the exact argument list; only the fixture's project settings, the arm's `--settings` file and its `--plugin-dir` apply. Managed settings of the machine still apply, so run every arm on the same machine.

## Models

The model is a dimension of the arm: `arm.json` lists `models` (a single `model` is read as a one-item list), and the baseline has both `claude-sonnet-5-5` and `claude-opus-5-5`. `bench.mjs run --arm <name>` runs every model of the arm, one after the other; `--model <id>` runs only that one, and the id must be one of the arm's models. The plan, the dry run and the worst case are per model. Results go to `results/<arm>/<model>/`, repeats are numbered per arm and model, and ledger entries carry the model.

Arms are judged per model and never pooled: `report --arm <name> [--model <id>] [--against baseline]` prints one section per model, and each verdict compares the arm with the baseline on the same model only.

## Cost

Every run has `--max-budget-usd 3`. The ledger holds the cumulative spend of every run of every arm, model and pack on the machine. There is one per machine, at `~/.claudalisk/code-intel-bench/ledger.json`, outside any checkout, so every worktree and every session that runs the benchmark charges the same $150. `CODE_INTEL_BENCH_LEDGER` names another file; the tests use it, a measurement never should.

Before `claude` starts, the runner reserves the run cap in the ledger, and refuses when `spent + 3 > 150`. As soon as `claude` ends, it replaces the reservation with the run's cost. A run that never settles (a killed process, a machine restart) stays charged the $3 cap, so the guard never under-counts. Every change to the ledger holds a lock file beside it, so two runs at the same time cannot both take the last $3. `--dry-run` prints the plan, the worst-case spend and the ledger without calling `claude`.

`node bench.mjs ledger` prints the ledger. `node bench.mjs ledger --merge <a.json>,<b.json>` adds the entries of other ledgers, such as the `results/ledger.json` that each worktree kept before the ledger moved, and counts each run once.

## The noise rule

The unit is the **repeat**: one pass over T1 to T7. With 3 runs per task, an arm has 3 repeats. A repeat's cost per accepted task is its total cost divided by the number of its runs that passed, and is infinite when none passed.

An arm **lowers cost** only when both hold:

1. **Separation.** Every one of the arm's 3 repeats costs less per accepted task than every one of the baseline's 3. With no real difference all 6 orderings are equally likely, so full separation in the arm's favour happens by chance 1 time in 20 (1 over C(6,3)). That is a 5% false-positive rule that needs no assumption about the distribution.
2. **Size.** The arm's mean cost per accepted task is at least 10% below the baseline's.

An arm **holds cost while correctness rises** when its mean cost per accepted task is not above the baseline's highest repeat, it passes at least 2 more of the 21 runs, and no task passes fewer runs than in the baseline.

Anything else is **no effect**, and the change is not accepted. `bench.mjs report --arm <name> --against baseline` prints both arms' tables and the verdict. The rule is the pure function `judge` in `noise.mjs`.

## Build processes left behind

`dotnet` MSBuild worker nodes and `VBCSCompiler` outlive the build that started them and can lock files in a run's copy. During each run the runner samples the process table every 3 seconds (`processes.mjs`: PowerShell `Get-CimInstance Win32_Process` on Windows, `ps` elsewhere, plus `/proc/<pid>/cwd` on Linux) and remembers every process that descends from the `claude` process or from a check command, with its start time. After the checks and before the copy is deleted, it kills the tree of each remaining dotnet, MSBuild or VBCSCompiler process that is a remembered descendant (same pid and same start time, so a reused pid is spared) or whose command line or working directory is inside the run's copy. The count and names go in the record as `leftoverProcesses`. It never uses `dotnet build-server shutdown` or kills by name machine-wide, because those would stop the owner's own servers. The `claude -p` environment is left as it was, since the baseline was measured without `MSBUILDDISABLENODEREUSE`, `DOTNET_CLI_USE_MSBUILD_SERVER` or `UseSharedCompilation`; only the hidden checks, which are not measured, run with node reuse, the MSBuild server and shared compilation turned off.

## Tasks and hidden tests

`tasks/Tn/task.json` holds the id, title, prompt, the #200 features and the check commands. `tasks/preamble.md` is put in front of every prompt: work in this tree, there is no remote, no CI and no issue, do not commit, push, branch or open a pull request, local builds and tests are allowed. `tasks/Tn/hidden/` is copied over the run's copy after the agent finishes. `tasks/Tn/reference/solution.patch` is a reference solution.

`node spikes/code-intel-bench/check-tasks.mjs` is the slow check (it builds the .NET solution and runs the frontend tests in 14 copies, so it is not in CI). For each task it checks that the hidden checks fail on the untouched fixture and pass once the reference solution is applied. `--tasks T1,T4` limits it, and `--build <folder>` builds the fixture first.

### An arm differs from the baseline only in its interface

Two things would otherwise break that.

**The scout gets only read-only tools.** The scout never edits (CLA-0080), so the `*-mcp` arms must not give it `rename` or `replaceBody`. Every tool in `spikes/code-intel/{a,b,c}/tools.mjs` carries the MCP annotation `annotations: { readOnlyHint }`, and `tools/list` serves it. The placeholder `${mcpReadTools}` expands to the tools with `readOnlyHint: true`, next to `${mcpTools}` for all of them; the scout adds `${mcpReadTools}`, the implementer `${mcpTools}`, and each has its own note (`scout-note.md` names only the read operations). Interface C is one `run` tool whose `ci` object can edit, so its server takes `--read-only`: `c/mcp.mjs --read-only` serves `readTools`, a `run` tool marked `readOnlyHint: true` whose `ci` has no `rename` and no `replaceBody`. The `c-mcp` overlay `.mcp.json` starts it as `code-intel-c-read` next to `code-intel-c`; the scout gets `mcp__plugin_claudalisk_code-intel-c-read__run` and the implementer the full one. `${mcpTools}` skips servers started with `--read-only`, so the implementer never gets the read-only twin.

**The CLI scout's Bash runs only the arm's CLI.** The scout's `Read, Grep, Glob, LSP` become `Bash` in the `*-cli` arms, which would let it `cat` and `grep`. Plugin agents ignore `hooks` and `permissionMode` frontmatter and runs use `bypassPermissions`, so allow rules do nothing, but a `PreToolUse` hook that denies still blocks. `arm-hooks/cli-only.mjs` is added by the `*-cli` arms with the staged CLI path. For a `Bash` or `PowerShell` call from an agent whose `agent_type` is `scout` or `<plugin>:scout` it allows exactly `node <staged cli path> <arguments>`, quoted or not, with no `; & | > <`, newline, backtick or `$(` outside quotes, and denies everything else with a reason that names the CLI. Calls from other agents and the main thread pass untouched. A shell call from a subagent whose input has `agent_id` but no `agent_type` is not treated as the scout but is counted as `unknownAgent`; a value above 0 on a real run means the guard did not work, and the report shows the column `Scout Bash allowed / denied / unknown agent` for arms that have it, with a warning. The CLI scout's note lists only the read operations, but the CLI itself still accepts `rename` and `replaceBody`, because a command line has no read-only annotation.

### Hooks in a benchmark run

The plugin's hooks run in every session, as they must. Reading them against a headless run:

- `scout-gate` denies `Grep`, `Glob`, shell searches and large reads in the main thread and points to `claudalisk:scout`. It lets subagent calls through. This is claudalisk's behaviour, and part of what the baseline measures, so the prompts do not work around it.
- `guardrail` and `ci-poll-guard` ask or deny on pushes, merges, polling CI, container commands against uat and similar. A task needs none of them, and `-p` has nobody to answer an `ask`. The prompts forbid pushing and waiting for CI, so no task should hit them.
- `session-start` and the app's own `AGENTS.md` tell the agent to verify through CI with `scripts/verify.mjs`. There is no remote in a benchmark copy, so the prompt preamble says to verify locally. That limitation is recorded here; a task whose agent insists on CI shows up as a failed or expensive run, which is the measurement.

## Private task packs

A task pack runs the same benchmark on an app and tasks that live outside this repository, in the owner's private repository. Nothing about a pack is committed here. A pack is a folder with a `pack.json`, a tasks folder in the same layout as `tasks/` (a `task.json`, `hidden/` and `reference/solution.patch` per task, and an optional `preamble.md`) and a results folder.

```json
{
  "id": "private-a",
  "fixture": {
    "repository": "https://github.com/owner/app.git",
    "commit": "<40-hex sha>",
    "prepare": [{ "cwd": "frontend", "command": ["npm", "ci"] }],
    "dependencies": ["frontend/node_modules"]
  },
  "tasks": "tasks",
  "results": "results"
}
```

- `id` matches `^[a-z0-9][a-z0-9-]*$`. `repository` is a URL or a path; a relative path resolves against the pack folder. `commit` is a full sha. `tasks` and `results` resolve against the pack folder.
- `prepare` is optional. Each step runs once, in its `cwd` inside the prepared clone.
- `dependencies` is optional. These folders are copied from the prepared clone into each run's copy, because they are not in git.

Commands:

```
node spikes/code-intel-bench/check-tasks.mjs --pack <path> [--tasks P1,P2] [--keep]
node spikes/code-intel-bench/bench.mjs run --arm baseline --pack <path> --runs 3 [--model <id>] [--dry-run]
node spikes/code-intel-bench/bench.mjs report --arm baseline --pack <path> [--model <id>]
```

The prepared clone lives in the temp folder as `claudalisk-bench-pack-<id>-<first 12 of the commit>`. It is reused while it is at the pinned commit and its marker (written inside `.git` after `prepare` succeeded) exists; otherwise it is cloned and prepared again. Each run works in a fresh clone of it, checked to be at the pinned commit, with the remote removed. `--dry-run` prepares nothing: it prints the pack id, the task ids, the worst-case spend and the ledger.

Records go to `<results>/<arm>/<model>/` in the pack, per model exactly like the built-in ones, and `--model` works with `--pack` on `run`, `report` and `--dry-run`, and `plan` and `report` read only that folder, so a built-in `T1` and a pack's `P1` never collide. The ledger stays `results/ledger.json` here and is the one budget for every run. A pack run adds exactly `{ arm, model, pack, task, repeat, costUsd, at }`: no file name, no path and no title from the pack.

## Limits

- Three repeats is what $150 buys; the rule's 5% false-positive rate holds, but it detects only large differences.
- The fixture is one small app, and the tasks are ones where code intelligence should matter. A result says nothing about work that does not look like them.
- T2 and T4 need a local frontend install in the fixture, and T2's optional `npm run api:types` and the app's database tests need Docker.
