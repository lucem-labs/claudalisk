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

- [CLA-0070](${CLAUDE_PLUGIN_ROOT}/adr/0070-testing-layers.md) (accepted): Domain tests for aggregate rules, Feature tests through the dispatcher on PostgreSQL, thin API tests, Playwright only for journeys; each rule is tested once at the lowest layer, and e2e tests locate by role, label or `data-testid`.
- [CLA-0016](${CLAUDE_PLUGIN_ROOT}/adr/0016-every-change-ships-with-tests.md) (accepted): every behaviour change adds tests. Report a test that cannot be added or run, and never skip it silently.
- [CLA-0017](${CLAUDE_PLUGIN_ROOT}/adr/0017-tests-run-on-throwaway-stacks.md) (accepted): tests start their own database and servers and never touch dev or uat.
- [CLA-0018](${CLAUDE_PLUGIN_ROOT}/adr/0018-real-postgres-never-skipped.md) (accepted): test persistence on real PostgreSQL in a Testcontainers-managed container. No Docker means a failure, never a skip.
- [CLA-0019](${CLAUDE_PLUGIN_ROOT}/adr/0019-parallel-safe-tests.md) (accepted): unique data, no fixed ports, template databases, a serial project after the parallel ones for global state and for specs that write to singleton aggregates (relative counts), no test-only owner, and builds one at a time.
- [CLA-0020](${CLAUDE_PLUGIN_ROOT}/adr/0020-no-wall-clock-assertions.md) (accepted): inject `TimeProvider`, and assert order and counts, not durations.
- [CLA-0011](${CLAUDE_PLUGIN_ROOT}/adr/0011-fresh-database-migrates.md) (accepted): A fresh, empty database migrates end to end.
- [CLA-0013](${CLAUDE_PLUGIN_ROOT}/adr/0013-external-data-on-explicit-trigger.md) (accepted): External data is refreshed only on an explicit trigger, and never from tests.
- [CLA-0064](${CLAUDE_PLUGIN_ROOT}/adr/0064-repository-and-test-layout.md) (accepted): Every app has the same repository layout, with a test project per module.
- [CLA-0076](${CLAUDE_PLUGIN_ROOT}/adr/0076-one-verify-script-per-cycle.md) (accepted): One verify call per cycle pushes to CI and prints only the failures.
