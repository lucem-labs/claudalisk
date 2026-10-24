---
name: testing
description: Claudalisk testing decisions (ADRs) - tests with every behaviour change, throwaway test stacks, real PostgreSQL that never skips silently, parallel-safe tests (unique data, free ports, template databases), no wall-clock assertions, and stubbed third-party APIs. Use when writing, fixing or reviewing backend tests, architecture tests or Playwright e2e tests in a claudalisk app.
paths:
  - "**/*Tests/**"
  - "frontend/e2e/**"
  - "**/playwright.config.*"
user-invocable: false
---

# Testing

These are claudalisk's decisions for tests. The app's own `AGENTS.md` wins where it lists a deviation (CLA-0028). Before changing code that one of these decisions covers, read the ADR.

- [CLA-0016](${CLAUDE_PLUGIN_ROOT}/adr/0016-every-change-ships-with-tests.md) (accepted): every behaviour change adds tests; a test that can't be added or run is reported, never skipped silently.
- [CLA-0017](${CLAUDE_PLUGIN_ROOT}/adr/0017-tests-run-on-throwaway-stacks.md) (accepted): tests start their own database and servers, and never touch dev or prod.
- [CLA-0018](${CLAUDE_PLUGIN_ROOT}/adr/0018-real-postgres-never-skipped.md) (proposed): persistence is tested on real PostgreSQL in a Testcontainers-managed container; no Docker means a failure, never a skip.
- [CLA-0019](${CLAUDE_PLUGIN_ROOT}/adr/0019-parallel-safe-tests.md) (proposed): unique data, no fixed ports, template databases, a serial project for global state, and builds one at a time.
- [CLA-0020](${CLAUDE_PLUGIN_ROOT}/adr/0020-no-wall-clock-assertions.md) (proposed): inject `TimeProvider`; assert order and counts, not durations.
- [CLA-0011](${CLAUDE_PLUGIN_ROOT}/adr/0011-fresh-database-migrates.md) (proposed): a fresh, empty database migrates end to end.
- [CLA-0013](${CLAUDE_PLUGIN_ROOT}/adr/0013-external-data-on-explicit-trigger.md) (proposed): tests never call live third-party APIs; use recorded responses or a stub server.
