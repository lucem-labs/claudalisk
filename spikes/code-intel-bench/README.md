# Code intelligence benchmark

The measuring instrument of CLA-0088. It answers one question: does a change to claudalisk's plugin lower the **cost per accepted task** of a coding session on a claudalisk app, or hold it while correctness rises?

It is plain Node.js (`.mjs`, no dependencies) and runs on Windows, Linux and macOS. Its unit tests need no login, no dotnet and no network; the `code-intel-bench` CI job runs them on all three systems.

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

## Tasks and hidden tests

`tasks/Tn/task.json` holds the id, title, prompt, the #200 features and the check commands. `tasks/preamble.md` is put in front of every prompt: work in this tree, there is no remote, no CI and no issue, do not commit, push, branch or open a pull request, local builds and tests are allowed. `tasks/Tn/hidden/` is copied over the run's copy after the agent finishes. `tasks/Tn/reference/solution.patch` is a reference solution.

`node spikes/code-intel-bench/check-tasks.mjs` is the slow check (it builds the .NET solution and runs the frontend tests in 14 copies, so it is not in CI). For each task it checks that the hidden checks fail on the untouched fixture and pass once the reference solution is applied. `--tasks T1,T4` limits it, and `--build <folder>` builds the fixture first.

### Hooks in a benchmark run

The plugin's hooks run in every session, as they must. Reading them against a headless run:

- `scout-gate` denies `Grep`, `Glob`, shell searches and large reads in the main thread and points to `claudalisk:scout`. It lets subagent calls through. This is claudalisk's behaviour, and part of what the baseline measures, so the prompts do not work around it.
- `guardrail` and `ci-poll-guard` ask or deny on pushes, merges, polling CI, container commands against uat and similar. A task needs none of them, and `-p` has nobody to answer an `ask`. The prompts forbid pushing and waiting for CI, so no task should hit them.
- `session-start` and the app's own `AGENTS.md` tell the agent to verify through CI with `scripts/verify.mjs`. There is no remote in a benchmark copy, so the prompt preamble says to verify locally. That limitation is recorded here; a task whose agent insists on CI shows up as a failed or expensive run, which is the measurement.

## Limits

- Three repeats is what $150 buys; the rule's 5% false-positive rate holds, but it detects only large differences.
- The fixture is one small app, and the tasks are ones where code intelligence should matter. A result says nothing about work that does not look like them.
- T2 and T4 need a local frontend install in the fixture, and T2's optional `npm run api:types` and the app's database tests need Docker.
