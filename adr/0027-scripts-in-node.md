# CLA-0027: Scripts are written in Node.js

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** code-standards
- **Enforced by:** reviewer

## Context

Two existing apps used PowerShell scripts. This caused several problems:

- Windows PowerShell 5.1 strips double quotes from native arguments, so SQL had to go through stdin.
- It treats redirected native stderr as an error.
- It converts JSON dates differently from PowerShell 7.
- The agent sandbox could not run PowerShell from the Microsoft Store.

## Decision

- Hooks, skill scripts and the environment scripts generated into apps are Node.js. Node is always present because the frontend needs it.
- Scripts start child processes with argument arrays (`execFile`/`spawn`), never a command string. SQL goes to `psql` on stdin.
- Write script logic as pure functions with `node:test` tests. Inject commands such as `gh` and `docker` so tests can replace them.

## Consequences

- Scripts behave the same on every OS and shell.
