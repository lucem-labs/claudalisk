# CLA-0027: Scripts are written in Node.js

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** code-standards
- **Enforced by:** reviewer; the `node:test` suites of the scripts that change an environment
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
- **Scripts that change an environment are steps over injected effects.** This covers every script that changes an environment's Compose project, database, environment file (CLA-0066) or backups, such as deploy, migrate, backup, backup pruning, restore and refresh-dev. Test harnesses and `verify.mjs` are not covered. The script is a sequence of step functions. Each command goes through a command runner the script receives, and each file write or delete goes through file functions it receives, under a state folder it receives. The entry script only parses the arguments and wires the steps to the real runner and file system. Tests replace both and assert:
  - the exact calls in order, including the orders that CLA-0010, CLA-0030 and CLA-0031 fix;
  - that a failing call stops every later step, apart from recording the fingerprints of migrations that ran (CLA-0010);
  - that each refusal changes no data, backup or environment file;
  - the target of every call that writes: the Compose project, environment file and database it addresses, so that no script breaks the rules of CLA-0029 and CLA-0032.

## Consequences

- Scripts behave the same on every OS and shell.
- CI logic is tested before it is pushed, and a workflow reads as a list of named steps.
- A test shows that each refusal changes no data and that no script writes to an environment it shouldn't.
