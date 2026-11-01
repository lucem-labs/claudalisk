# CLA-0077: Wait for CI in one call, never by polling

- **Status:** accepted
- **Date:** 2026-11-01
- **Area:** session-economy
- **Enforced by:** `scripts/verify.mjs` in the app (CLA-0076); `implementer` agent; session-economy and workflow skills; reviewer. No hook yet: the plugin has no hooks.
- **Issue:** #96

## Context

Every model request sends the whole conversation again (CLA-0073). An agent that waits for CI by checking again and again (`gh run view`, `gh run list`, `gh pr checks`, the host's pull request status tool, with a sleep or a new turn in between) sends the whole context with every check. A late-session context can be hundreds of thousands of tokens, so an hour of checks every minute costs tens of millions of tokens and returns nothing the agent needs until the last check. CLA-0023 waits for green CI before a pull request is opened, but does not say how to wait. CLA-0076 already gives the app one call that pushes, waits for CI on that commit and prints only the failures.

## Decision

- **Waiting for CI is one call that blocks until the checks finish.** Polling with a loop of separate calls is not allowed. The agent never checks the status of a run or a pull request again and again, whether by shell calls, the host's pull request status tool, or a scheduled wake-up.
- **In an app, that call is `node scripts/verify.mjs`** (CLA-0076). It pushes, finds the runs of that exact commit, waits quietly inside the one call, and prints only the failures. There is no second script for waiting: run on a commit the remote already has, `verify.mjs` pushes nothing and only waits.
  - **The main thread** runs it in the background with a timeout longer than the CI run, such as `--timeout 60`, and does other work or ends its turn. The host wakes the session when the script exits. It does not read the script's output until then.
  - **The `claudalisk:implementer` subagent** (CLA-0074) runs it in the foreground with the Bash tool's timeout at 600000 ms and the script's default of 9 minutes. When the script says CI is still running, the next call waits again. That is at most one request per 9 minutes, not a status check.
- **Where there is no script,** such as a repository that is not a claudalisk app, the one call is `gh run watch <run id> --exit-status` or `gh pr checks <pr> --watch --fail-fast`, run in the background. Both reprint the status while they wait, so the agent discards their output and reads only the exit code. After a failure, read `gh run view <run id> --log-failed` once, trimmed to the failing step.
- **The host's pull request monitor is enough once the pull request is open.** Where the host watches the pull request's checks and wakes the session on a failure, such as the Claude desktop app's CI monitor, the agent relies on it after it opens the pull request (CLA-0023). It does not also run the script or check the status to see whether CI passed, and it reads the host's status tool once when it binds the pull request, not again to wait.
- **Before the pull request exists, the script is the only way.** CLA-0023 opens the pull request only when CI is green on the branch head, so a host monitor has nothing to watch yet. The script is also the fallback after the pull request is open, on a host without a monitor.
- **No `ci-watcher` agent.** The script already turns a CI run into one call and a few KB of output. A subagent would add its own system prompt and brief to the wait, and return a report no shorter than the script's summary.

## Consequences

- While CI runs, the session sends nothing. A wait costs one request when it starts and one when it ends, whatever the length of the run.
- A wait in the main thread ends the turn or runs beside other work, so the main thread cannot quickly react to a job that fails early. `--fail-fast` makes the script return at the first failed job.
- On a host with a pull request monitor, the agent depends on that monitor to learn about failures after the pull request is open.
- Nothing stops a foreground `gh run view` or `gh pr checks` without `--watch` yet. A guardrail hook can ask before one and point to the script once the plugin has hooks; until then this rule is prompt only.
