# CLA-0019: Tests are parallel-safe

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** testing
- **Enforced by:** generated test infrastructure; reviewer
- **Issue:** #10, #89

## Context

A test class that builds a database per test can take most of the backend suite's time. Fixed ports make two CI runs on one machine collide.

## Decision

- **Unique data.** Tests create uniquely named data and assert only on their own data.
- **Global state.** Tests that read global totals run in a separate serial Playwright project. It runs after the parallel projects, as a second `playwright test --project` call, so a failure in the parallel run does not skip it.
- **Singleton aggregates.** Some aggregates exist once per database, such as the owner's settings or cart in a single-owner app. A spec that writes to one of them runs in the same serial project. It reads the value before it acts and asserts the change relative to that value, never an absolute count, because other specs and earlier runs leave data behind.
- **No test-only owner.** There is no request header, query parameter or other switch that makes the API act as a different owner for tests. The API under test is the API that ships.
- **Ports.** Use no fixed ports. Ports are free or can be overridden through the environment.
- **Database speed.** Backend tests clone a migrated template database (`CREATE DATABASE … TEMPLATE`). They do not migrate per test.
- **Builds.** Builds run one at a time, because parallel builds lock shared outputs. MSBuild node reuse is off where several builds can overlap.

## Consequences

- Specs that touch singleton aggregates run one at a time and pass on a database that other specs have already used.
- The suite is fast enough to run on every pull request and before you finish a change.
