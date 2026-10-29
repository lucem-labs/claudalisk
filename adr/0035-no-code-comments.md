# CLA-0035: Code carries no comments

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** code-standards
- **Enforced by:** reviewer subagent; the implementer brief

## Context

Comments drift away from the code they describe. In an app built mostly by agents they multiply quickly: they restate the code, narrate changes or explain decisions that belong elsewhere. The owner wants code that explains itself. Explanations belong where people review and version them on purpose.

## Decision

- **No comments in any code.** This applies to everything an agent generates or writes, in every area and language: backend C#, frontend TypeScript and CSS, tests, scripts and SQL. It also covers project files, Compose files, Dockerfiles, CI workflows and other config. Do not write line or block comments, XML doc comments (`///`), JSDoc, or `#` or `<!-- -->` comments.
- **Intent goes elsewhere:**
  - into names: types, methods, variables and test names that say what they do;
  - into small functions;
  - into tests that show the behaviour;
  - into commit messages, pull request descriptions, ADRs and docs, for anything that explains why.
- **Exceptions.** These are directives, not explanations:
  - shebang lines;
  - compiler and tool directives that need comment syntax, such as `#pragma` and lint suppressions;
  - tool-generated files that nobody edits by hand, such as EF Core migration designer files and model snapshots.

## Consequences

- The reviewer rejects added comments like any other rule break. It suggests a better name, test or ADR instead.
- A decision that needs an explanation gets an ADR. There it cannot drift silently away from the code.
