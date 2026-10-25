# CLA-0018: Persistence tests use real PostgreSQL and never skip silently

- **Status:** proposed
- **Date:** 2026-10-24
- **Area:** testing
- **Enforced by:** generated test fixture
- **Issue:** #10

## Context

In two existing apps, real-database tests skipped themselves when a connection variable was unset. A local `dotnet test` passed with every such test skipped. Fakes also hid EF Core translation bugs that only real PostgreSQL caught.

## Decision

- Persistence and query behaviour is tested against real PostgreSQL, not fakes.
- **Testcontainers for .NET orchestrates the database** (the `Testcontainers.PostgreSql` package).
  - The generated fixture starts one PostgreSQL container per test run, pinned to the same major version as dev and uat. It's shared through an assembly- or collection-level fixture.
  - The fixture applies the migrations once to a template database. Each test gets its own database cloned from that template (CLA-0019).
  - The container is removed when the run ends.
  - There is no connection-string variable to set, so nothing to forget.
- **No Docker means a failure, not a skip.** If the fixture can't start a container, the database tests fail with a message saying Docker is needed. That applies locally, in CI and under the Stop gate.
- **Skips are tracked.** `Skip` needs a tracked reason.

## Consequences

- A green run means the database tests actually ran.
- `dotnet test` works the same on a developer machine, in CI and in the Stop gate, as long as Docker is running. CI no longer needs its own PostgreSQL service for the backend tests: the containerised runners provide Docker.
- The two existing apps used a connection-string variable and a hand-started database. Adopting them means switching their fixtures to Testcontainers.
