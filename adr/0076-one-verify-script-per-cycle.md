# CLA-0076: One verify call per cycle pushes to CI and prints only the failures

- **Status:** accepted
- **Date:** 2026-11-01
- **Area:** session-economy
- **Enforced by:** `scripts/verify.mjs` and `scripts/trx-annotations.mjs` in the app; `implementer` agent; session-economy skill; reviewer
- **Issue:** #95

## Context

Every model request sends the whole conversation again (CLA-0073). Checking a change by hand takes many shell calls: build, each test project, each linter, then pushing and reading CI. Each call is a request that sends the context again, and each returns the tool's full output, most of which the agent never needs. CI already runs every check on the shared runners for each pushed commit (CLA-0033, CLA-0034). Running the same checks locally as well means two definitions of "the checks" that drift apart.

## Decision

- **CI is the only verifier.** The agent does not run the build, the tests or the linters locally to check a change. It pushes, and reads the result of CI on that commit.
- **Every app has `node scripts/verify.mjs`** (CLA-0027, CLA-0064). One call does a whole cycle:
  - commits any changes with `-m "<message>"` and pushes the issue branch. It refuses `main`, and it pushes nothing when the remote already has the commit;
  - waits for the CI runs of that exact commit, found by its SHA and never as "the latest run";
  - prints one line per job, then only the failures, capped at about 4 KB, and exits non-zero when a job failed.
- **Watching is quiet and cheap.** The script polls the Actions API itself and prints nothing while it waits. It starts at 5 seconds and backs off to 20. It fetches jobs only when it needs them, and rides out two API errors in a row.
  - `--backend`, `--frontend` and `--e2e` wait only for the jobs of those layers, and return as soon as those jobs finish. A job belongs to a layer when its name contains `backend`, `frontend` or `e2e`.
  - With no flag, it waits for every run on the commit, so one cycle reports every failure.
  - `--fail-fast` returns at the first failed job.
  - It stops after `--timeout` minutes (9 by default, under the agent's 10-minute command limit) and says to run it again. Run again on a pushed commit, it pushes nothing and keeps waiting.
- **Failures come from check-run annotations, which CI produces.** Parsing happens on the runner, not in the agent's context. `verify.mjs` reads each failed job's annotations, which are small and structured, and drops GitHub's "Process completed with exit code" notice. The CI jobs produce annotations with the tools' own GitHub output:
  - **Vitest:** its `github-actions` reporter, which Vitest turns on in GitHub Actions.
  - **Playwright:** its `github` reporter.
  - **oxlint:** `--format=github`.
  - **`tsc` and the .NET compiler:** the problem matchers that `actions/setup-node` and `actions/setup-dotnet` register.
  - **.NET tests:** `dotnet test --logger trx`, then `node scripts/trx-annotations.mjs <results folder>` in a step that runs on failure. It writes one annotation per failing test, with its file and line and the message, within GitHub's limit of 10 per step, and a table of every failure to the job summary.
  - A failed job without annotations falls back to the last 20 lines of its failed step.
- **The full logs go to the env-state folder** (CLA-0066). `verify.mjs` saves the log of each failed job to `~/.claudalisk/apps/<app>/verify/<worktree>/<job>.log`, and each run replaces them. The summary ends with the folder, so the agent can grep a log when the summary is not enough. Nothing is written to the checkout.
- **The agent runs it once per verify cycle,** as one call, and reads the summary. The `claudalisk:implementer` agent (CLA-0074) commits and pushes only through it.
- An app without the scripts copies `${CLAUDE_PLUGIN_ROOT}/templates/app/scripts/` into its `scripts/` and wires its CI jobs as `templates/README.md` shows. An app that cannot use CI for this lists the deviation in its `AGENTS.md` (CLA-0028).

## Consequences

- A verify cycle is one request with a few KB of output. While CI runs, the agent sends nothing.
- The checks are defined once, in CI, so the agent's verdict and the pull request's checks are the same.
- A cycle takes as long as a CI run, including queueing and checkout, and every cycle uses the shared runners (CLA-0033). Layer flags and `--fail-fast` shorten a cycle when only one layer changed.
- Every cycle is a pushed commit, so the issue branch carries the implementer's commits. The main thread reviews the branch diff before it opens the pull request (CLA-0023).
- The output depends on the tools' GitHub annotation formats and on GitHub's annotation limits, not on their console output. A job that annotates nothing still reports the tail of its failed step.
