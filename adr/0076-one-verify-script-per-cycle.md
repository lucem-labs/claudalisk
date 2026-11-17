# CLA-0076: CI is the only verifier, and one verify call per cycle pushes, waits without polling and prints only the failures

- **Status:** accepted
- **Date:** 2026-11-01
- **Area:** workflow
- **Enforced by:** `scripts/verify.mjs` and `scripts/trx-annotations.mjs` in the app; `implementer` agent; workflow skill; `hooks/ci-poll-guard.mjs` (asks before a foreground poll); reviewer
- **Issue:** #95, #96, #194

## Context

Every model request sends the whole conversation again (CLA-0073).

- Checking a change by hand takes many shell calls: build, each test project, each linter, then pushing and reading CI. Each call resends the context and returns output the agent mostly does not need.
- Waiting for CI by checking its status again and again resends the context with every check. An hour of checks every minute can cost tens of millions of tokens.
- CI already runs every check on the shared runners for each pushed commit (CLA-0034). Running the same checks locally gives two definitions of "the checks" that drift apart.

## Decision

- **CI is the only verifier.** The agent does not run the build, the tests or the linters locally to check a change. It pushes, and reads CI's result on that commit.
- **Every app has `node scripts/verify.mjs`.** One call does a whole cycle:
  - It commits any changes with `-m "<message>"` and pushes the issue branch to its own name on `origin`. It refuses `main`, and pushes nothing when the remote already has the commit.
  - It waits quietly for the CI runs of that exact commit, found by its SHA.
  - It prints one line per job, then only the failures, capped at about 4 KB, and exits non-zero when a job failed.
- **Flags:**
  - `--backend`, `--frontend` and `--e2e` wait only for those layers' jobs.
  - `--fail-fast` returns at the first failed job.
  - `--timeout` sets the minutes before the script says to run it again, 9 by default, under the agent's 10-minute command limit. Run again on a pushed commit, it only waits.
- **Failures come from the check-run annotations that CI produces,** so parsing happens on the runner. `templates/README.md` lists how each tool annotates. A job without annotations falls back to its failed step's log. The full logs of failed jobs go to `~/.claudalisk/apps/<app>/verify/<worktree>/` (CLA-0066), never the checkout.
- **Waiting is one blocking call, never a loop of status checks,** whether by shell calls, the host's pull request status tool or a scheduled wake-up.
  - **The main thread** runs `verify.mjs` in the background with a timeout longer than the run, such as `--timeout 60`. It does other work or ends its turn until the host wakes it.
  - **The implementer** (CLA-0074) runs it in the foreground with `--timeout 4`. A subagent's prompt cache lasts five minutes, so a longer wait makes the next request write the whole context to the cache again, at 1.25 times the input price instead of a tenth.
  - **Outside a claudalisk app,** the call is `gh run watch <id> --exit-status` or `gh pr checks <pr> --watch --fail-fast` in the background. Read only the exit code, then `gh run view <id> --log-failed` once after a failure.
  - **Once the pull request is open,** a host monitor that wakes the session on a failure, such as the Claude desktop app's, is enough. Before the pull request exists (CLA-0023), the script is the only way.
- **No `ci-watcher` agent.** A subagent would add its own prompt and brief to the wait and return a report no shorter than the script's.
- An app without the scripts copies `${CLAUDE_PLUGIN_ROOT}/templates/app/scripts/`, installs `@claudalisk/scripts` (CLA-0084) and wires its CI jobs as `templates/README.md` shows. An app that cannot use CI for this lists the deviation in `AGENTS.md` (CLA-0028).

## Consequences

- A verify cycle costs one request when it starts and one when it ends, with a few KB of output, however long CI runs.
- The agent's verdict and the pull request's checks are the same checks.
- A cycle takes as long as a CI run, and every cycle uses the shared runners (CLA-0033). Layer flags and `--fail-fast` shorten a cycle.
- Every cycle is a pushed commit, so the main thread reviews the branch diff before it opens the pull request.
- Inside an app, the `PreToolUse` hook `hooks/ci-poll-guard.mjs` asks before a foreground `gh run view` or `gh pr checks` without `--watch`, and points to `verify.mjs`. It allows background calls and fails open.
