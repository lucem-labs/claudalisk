# CLA-0076: One verify script per cycle, which prints only the failures

- **Status:** accepted
- **Date:** 2026-11-01
- **Area:** session-economy
- **Enforced by:** `scripts/verify.mjs` in the app; `implementer` agent; session-economy skill; reviewer
- **Issue:** #95

## Context

Every model request sends the whole conversation again (CLA-0073). Checking a change by hand takes one shell call for the build, one for each test project and one for each linter, and each call is a request that sends the context again. Each also returns the tool's full output: restore logs, every passing test and long stack traces, most of which the agent never needs.

## Decision

- **Every app has `node scripts/verify.mjs`** (CLA-0027, CLA-0064). It checks a change in one call:
  - **backend:** `dotnet build` in `backend/`, then `dotnet test --no-build` with a TRX report. Analyzers run as part of the build (CLA-0071). A failed build skips the tests.
  - **frontend:** the `build` and `lint` scripts of `frontend/package.json` (`tsc`, oxlint and Steiger, CLA-0040, CLA-0065), then Vitest with its JSON reporter.
  - **e2e:** Playwright with its JSON reporter, on its own throwaway stack (CLA-0017).
- **Layer flags keep a cycle narrow.** `--backend`, `--frontend` and `--e2e` run only those layers, and they combine. With no flag it runs backend and frontend, and `--all` adds e2e. Run e2e once the lower layers are green, and before the pull request (CLA-0023).
- **It runs quietly and prints a short summary:** one line per step, then only the failures, capped at about 4 KB. It exits non-zero when any step fails.
- **Failing tests come from the test runners' reports, not from the console.** It reads TRX for .NET, and the JSON reporters for Vitest and Playwright. These name each failing test with its message and the top of its stack, whatever the console looks like. Build and lint errors have no report, so it keeps their `error` lines, or the last lines of the output when it finds none.
- **The full log goes to the env-state folder,** `~/.claudalisk/apps/<app>/verify/<worktree>/verify.log` (CLA-0066), with the reports next to it. Each run replaces it. The summary ends with its path, so the agent can grep it when the summary is not enough. Nothing is written to the checkout.
- **The agent runs it once per verify cycle,** as one call, and reads the summary. It does not run the build, the tests or the linters as separate calls. The `claudalisk:implementer` agent (CLA-0074) uses it as its check.
- An app without the script yet copies `${CLAUDE_PLUGIN_ROOT}/templates/app/scripts/verify.mjs` and its test into its `scripts/`. An app with other steps adds them to its copy and lists the change in its `AGENTS.md` (CLA-0028).

## Consequences

- A verify cycle is one request with a few KB of output, not several requests with tens of KB each.
- The test runners' reports keep working when their console output changes. The script depends on their report formats instead.
- The agent greps the full log only when it needs more, so long output stays out of the context.
- CI keeps its own parallel jobs (CLA-0034). The verify script is for the agent's loop, not a replacement for CI.
