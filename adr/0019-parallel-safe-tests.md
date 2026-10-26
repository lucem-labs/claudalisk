# CLA-0019: Tests are parallel-safe

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** testing
- **Enforced by:** generated test infrastructure; reviewer
- **Issue:** #10

## Context

A test class that builds a database per test can take most of the backend suite's time. Fixed ports make two CI runs on one machine collide.

## Decision

- **Unique data.** Tests create uniquely named data and assert only on their own data.
- **Global state.** Tests that read global totals run in a separate serial Playwright project.
- **Ports.** Use no fixed ports. Ports are free or can be overridden through the environment.
- **Database speed.** Backend tests clone a migrated template database (`CREATE DATABASE … TEMPLATE`). They do not migrate per test.
- **Builds.** Builds run one at a time, because parallel builds lock shared outputs. MSBuild node reuse is off where several builds can overlap.

## Consequences

- The suite is fast enough to run on every pull request and before you finish a change.
