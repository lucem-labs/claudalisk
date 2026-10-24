# CLA-0027: Scripts are written in Node.js

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** environments
- **Enforced by:** reviewer

## Context

Two existing apps used PowerShell scripts. That caused several problems:

- Windows PowerShell 5.1 strips double quotes from native arguments, so SQL had to go through stdin.
- It treats redirected native stderr as an error.
- It converts JSON dates differently from PowerShell 7.
- PowerShell from the Microsoft Store couldn't be run from the agent sandbox.

## Decision

- Hooks, skill scripts and the environment scripts generated into apps are Node.js. Node is always present, because the frontend needs it.
- Child processes are started with argument arrays (`execFile`/`spawn`), never a command string. SQL goes to `psql` on stdin.
- Script logic is written as pure functions with `node:test` tests. Commands such as `gh` and `docker` are injected so tests can replace them.

## Consequences

- Scripts behave the same on every OS and shell.
