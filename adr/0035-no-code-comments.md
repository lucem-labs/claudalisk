# CLA-0035: Code carries no comments

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** reviewer subagent; the implementer brief

## Context

Comments drift away from the code they describe, and in an app built mostly by agents they multiply quickly: restating the code, narrating changes or explaining decisions that belong elsewhere. The owner wants code that explains itself, with explanations kept where they are reviewed and versioned on purpose.

## Decision

- **No comments in code.** Generated and agent-written code carries none: no line or block comments, no XML doc comments (`///`), and no comments in project files, Compose files, workflows or other config.
- **Intent goes elsewhere:**
  - into names: types, methods, variables and test names that say what they do;
  - into small functions;
  - into tests that show the behaviour;
  - into commit messages, pull request descriptions, ADRs and docs, for anything that explains why.
- **Exceptions**, because they are directives, not explanations:
  - shebang lines;
  - compiler and tool directives that need comment syntax, such as `#pragma` and lint suppressions;
  - tool-generated files that the app doesn't edit by hand, such as EF Core migration designer files and model snapshots.

## Consequences

- The reviewer rejects added comments the way it rejects any other rule break, and suggests a better name, test or ADR in their place.
- A decision that needs explaining gets an ADR or a line in the app's `AGENTS.md`, where it can't drift silently away from the code.
