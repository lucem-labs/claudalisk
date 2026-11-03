# CLA-0027: Scripts are written in Node.js

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** code-standards
- **Enforced by:** reviewer; the data scripts' `node:test` suites
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
- **Scripts that change data are steps over injected effects.** This covers every script that runs Docker, `psql` or a migration, or writes environment state (CLA-0066), such as deploy, migrate, backup, backup pruning, restore and refresh-dev. The script is a sequence of step functions. Each command goes through a command runner the script receives, and each file write or delete goes through file functions it receives, under a state folder it receives. The entry script only parses the arguments and wires the steps to the real runner and file system. Tests replace both and assert:
  - the exact calls in order, including the orders other ADRs fix: the pre-deploy backup, its manifest written last, is complete before any migration runs (CLA-0030, CLA-0031); the fingerprints are recorded right after the migrations run, even when a later step fails (CLA-0010); a restore verifies the checksums before it restores into a temporary database and swaps it in (CLA-0031);
  - that a failing call stops every later step;
  - that each refusal makes no call that changes state, only the reads that led to it. The refusals include the CLA-0030 checks, an applied migration that changed, applied migrations the commit lacks and a failed backup;
  - the target of every call that writes: the Compose project, environment file and database it addresses. A dev script never writes uat, and no script the agent runs restores uat or removes its volume (CLA-0029, CLA-0031, CLA-0032).

## Consequences

- Scripts behave the same on every OS and shell.
- CI logic is tested before it is pushed, and a workflow reads as a list of named steps.
- A test shows that each refusal changes nothing and that no script writes to an environment it shouldn't.
