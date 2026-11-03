# CLA-0027: Scripts are written in Node.js

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** code-standards
- **Enforced by:** reviewer
- **Issue:** #88

## Context

PowerShell scripts cause several problems:

- Windows PowerShell 5.1 strips double quotes from native arguments, so SQL has to go through stdin.
- It treats redirected native stderr as an error.
- It converts JSON dates differently from PowerShell 7.
- The agent sandbox cannot run PowerShell from the Microsoft Store.

Logic written inline in a CI workflow has no tests and runs only on a pushed commit. A script that changes real data, such as a deploy, a backup, a restore or a refresh, can lose data that cannot be recreated (CLA-0029) when it runs a step it should have skipped.

## Decision

- Hooks, skill scripts and the environment scripts generated into apps are Node.js. Node is always present because the frontend needs it.
- Scripts start child processes with argument arrays (`execFile`/`spawn`), never a command string. SQL goes to `psql` on stdin.
- Write script logic as pure functions with `node:test` tests. Inject commands such as `gh` and `docker` so tests can replace them.
- **CI steps are one line.** A workflow step's `run` is a single command, such as `node scripts/<name>.mjs` or one tool call like `dotnet test`. Anything longer, such as several commands, a loop, a condition or a pipe, is a tested script that the step calls.
- **Scripts that change real data are steps over an injected runner.** A deploy, backup, restore or refresh script is a sequence of step functions, and each step runs its commands through a command runner that the script receives. The entry script only parses the arguments and wires the steps to the real runner. Tests replace the runner and assert:
  - the order of the calls;
  - the calls that never happen: a refusal makes no dump, restore or migrate call.

## Consequences

- Scripts behave the same on every OS and shell.
- CI logic is tested before it is pushed, and a workflow reads as a list of named steps.
- A test shows that each refusal changes nothing.
