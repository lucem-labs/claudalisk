---
name: code-standards
description: Claudalisk standards (ADRs) that apply to all code in a claudalisk app (backend, frontend, tests, scripts, project files, Compose files, workflows and config), such as carrying no code comments. Use when writing, editing or reviewing any code or config file in a claudalisk app.
paths:
  - "**/*.cs"
  - "**/*.csproj"
  - "**/*.props"
  - "**/*.slnx"
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.mjs"
  - "**/*.css"
  - "**/*.json"
  - "**/*.yml"
  - "**/*.yaml"
  - "**/Dockerfile"
  - "**/*.sql"
user-invocable: false
---

# Code standards

These are claudalisk's decisions for every kind of code and config. The app's `AGENTS.md` wins where it lists a deviation (CLA-0028). Before writing code that one of these decisions covers, read the ADR.

- [CLA-0035](${CLAUDE_PLUGIN_ROOT}/adr/0035-no-code-comments.md) (accepted): code has no comments (no line, block or XML doc comments, none in config). Intent goes into names, tests, commits and ADRs. CI runs the template's `scripts/no-comments.mjs` as its own step over every covered file type.
- [CLA-0027](${CLAUDE_PLUGIN_ROOT}/adr/0027-scripts-in-node.md) (accepted): scripts are Node.js, start processes with argument arrays and send SQL on stdin; a CI step is one line (`node scripts/<name>.mjs` or one tool call) and anything longer is a tested script; a script that changes an environment's Compose project, database, environment file or backups is step functions over an injected command runner and file functions, whose tests assert the exact calls in order, that a failure stops later steps, that a refusal changes no data or environment state, and the environment each write targets.
- [CLA-0078](${CLAUDE_PLUGIN_ROOT}/adr/0078-read-by-range-never-re-read.md) (accepted): find lines with Grep (in the main thread, through the scout), read large files by range with `Read` (not `cat` or `sed` in Bash), and never re-read a file just edited or one unchanged since the last read; briefs to subagents name the lines to change.
