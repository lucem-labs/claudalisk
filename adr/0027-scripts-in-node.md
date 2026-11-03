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
  - the exact calls in order, including the orders other ADRs fix:
    - the pre-deploy backup, its manifest written last, is complete before any migration runs, except on the first deploy to an empty database (CLA-0030, CLA-0031);
    - the fingerprints are recorded right after the migrations run, even when a later step fails (CLA-0010, CLA-0030);
    - a restore verifies the checksums before it restores into a temporary database and swaps it in, and a uat restore first backs up the current uat data (CLA-0031);
  - that a failing call stops every later step, apart from recording the fingerprints of migrations that ran (CLA-0010). A failed backup stops the deploy before it migrates;
  - that each refusal changes no data, backup or environment file. The CLA-0030 gate checks (confirmation, clean tree, latest `main`, open pull request, CI) refuse after reads only, before any build. Its two migration refusals, an applied migration that changed and applied migrations the commit lacks, follow only reads, the image build and the database start;
  - the target of every call that writes: the Compose project, environment file and database it addresses. A dev script never writes uat, so data never flows from dev to uat (CLA-0032). No script runs `docker compose down -v`, `docker volume rm`, `docker volume prune` or `docker system prune` against uat, and no script the agent runs restores uat (CLA-0029, CLA-0031).

## Consequences

- Scripts behave the same on every OS and shell.
- CI logic is tested before it is pushed, and a workflow reads as a list of named steps.
- A test shows that each refusal changes no data and that no script writes to an environment it shouldn't.
