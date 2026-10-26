---
name: testing
description: Claudalisk testing decisions (ADRs). Covers tests with every behaviour change, which layer tests what (domain, feature, API, end to end), throwaway test stacks, real PostgreSQL that never skips silently, parallel-safe tests (unique data, free ports, template databases), no wall-clock assertions, and stubbed third-party APIs. Use when writing, fixing or reviewing backend tests, architecture tests or Playwright e2e tests in a claudalisk app.
paths:
  - "**/*Tests/**"
  - "frontend/e2e/**"
  - "**/playwright.config.*"
user-invocable: false
---

# Testing

These are claudalisk's decisions for tests. The app's `AGENTS.md` wins where it lists a deviation (CLA-0028). Before changing code that one of these decisions covers, read the ADR.

- [CLA-0070](${CLAUDE_PLUGIN_ROOT}/adr/0070-testing-layers.md) (accepted): Domain tests for aggregate rules, Feature tests through the real dispatcher on PostgreSQL, thin API tests for HTTP, Playwright only for journeys. Test each rule once at the lowest layer, fake only third parties and time, no coverage target.
- [CLA-0016](${CLAUDE_PLUGIN_ROOT}/adr/0016-every-change-ships-with-tests.md) (accepted): every behaviour change adds tests. Report a test that cannot be added or run, and never skip it silently.
- [CLA-0017](${CLAUDE_PLUGIN_ROOT}/adr/0017-tests-run-on-throwaway-stacks.md) (accepted): tests start their own database and servers and never touch dev or uat.
- [CLA-0018](${CLAUDE_PLUGIN_ROOT}/adr/0018-real-postgres-never-skipped.md) (accepted): test persistence on real PostgreSQL in a Testcontainers-managed container. No Docker means a failure, never a skip.
- [CLA-0019](${CLAUDE_PLUGIN_ROOT}/adr/0019-parallel-safe-tests.md) (accepted): unique data, no fixed ports, template databases, a serial project for global state, and builds one at a time.
- [CLA-0020](${CLAUDE_PLUGIN_ROOT}/adr/0020-no-wall-clock-assertions.md) (accepted): inject `TimeProvider`, and assert order and counts, not durations.
- [CLA-0011](${CLAUDE_PLUGIN_ROOT}/adr/0011-fresh-database-migrates.md) (accepted): a fresh, empty database migrates end to end.
- [CLA-0013](${CLAUDE_PLUGIN_ROOT}/adr/0013-external-data-on-explicit-trigger.md) (accepted): tests never call live third-party APIs. They use recorded responses or a stub server.
- [CLA-0064](${CLAUDE_PLUGIN_ROOT}/adr/0064-repository-and-test-layout.md) (accepted): one test project per module, mirroring its features; frontend unit tests sit next to their code as `*.test.ts`.
