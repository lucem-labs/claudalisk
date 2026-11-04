# CLA-0035: Code carries no comments

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** code-standards
- **Enforced by:** the template's comment checker in CI (`scripts/no-comments.mjs`); reviewer subagent; the implementer brief
- **Issue:** #88

## Context

Comments drift away from the code they describe. In an app built mostly by agents they multiply quickly: they restate the code, narrate changes or explain decisions that belong elsewhere. The owner wants code that explains itself. Explanations belong where people review and version them on purpose.

A check that runs inside another tool's step, such as the frontend lint, covers only that tool's files, and it stops when that step is removed.

## Decision

- **No comments in any code.** This applies to everything an agent generates or writes, in every area and language: backend C#, frontend TypeScript and CSS, tests, scripts and SQL. It also covers project files, Compose files, Dockerfiles, CI workflows and other config. Do not write line or block comments, XML doc comments (`///`), JSDoc, or `#` or `<!-- -->` comments.
- **Intent goes elsewhere:**
  - into names: types, methods, variables and test names that say what they do;
  - into small functions;
  - into tests that show the behaviour;
  - into commit messages, pull request descriptions, ADRs and docs, for anything that explains why.
- **Exceptions.** These are directives, not explanations:
  - shebang lines;
  - compiler and tool directives that need comment syntax, such as `#pragma`, lint suppressions, `/// <reference />` and the parser directives at the top of a Dockerfile;
  - the bare `/// <inheritdoc />` that EF Core writes into every migration, because a migration that has run never changes (CLA-0010). It is allowed only in migration files;
  - tool-generated files that nobody edits by hand, such as EF Core migration designer files, model snapshots and generated API types.
- **One CI check covers every listed file type.** The app copies the template's comment checker, `scripts/no-comments.mjs`, and runs it as its own CI step over the tracked files. The template's README lists which file types it covers. A file the checker cannot tell apart from a hand-written one, such as a vendored file or a generated file without a generated-file header, is named with `--skip`.
- **Migrations that have run are never edited for the check.** A comment in a migration that has run (applied to uat or tracked on `origin/main`), or in SQL that it runs, stays, and the file is named with `--skip` (CLA-0010). This applies when an existing app adopts the checker.

## Consequences

- CI fails on a comment in any covered file type, and removing a linter or test runner leaves the check in place.
- The reviewer still rejects added comments like any other rule break, including those in files the checker skips. It suggests a better name, test or ADR instead.
- A decision that needs an explanation gets an ADR. There it cannot drift silently away from the code.
