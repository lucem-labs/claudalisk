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

- [CLA-0035](${CLAUDE_PLUGIN_ROOT}/adr/0035-no-code-comments.md) (accepted): code has no comments (no line, block or XML doc comments, none in config). Intent goes into names, tests, commits and ADRs. CI runs `scripts/no-comments.mjs`, the app's entry of `@claudalisk/scripts` (CLA-0084), as its own step over every covered file type.
- [CLA-0027](${CLAUDE_PLUGIN_ROOT}/adr/0027-scripts-in-node.md) (accepted): scripts are Node.js, start processes with argument arrays and send SQL on stdin. A CI step is one line. A script that changes an environment is step functions over an injected command runner, tested call by call.
- [CLA-0078](${CLAUDE_PLUGIN_ROOT}/adr/0078-read-by-range-never-re-read.md) (accepted): Read files by range, and never re-read a file that has not changed.
