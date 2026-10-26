# CLA-0018: Persistence tests use real PostgreSQL and never skip silently

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** testing
- **Enforced by:** generated test fixture
- **Issue:** #10

## Context

Real-database tests that skip themselves when a connection variable is unset let a local `dotnet test` pass with every such test skipped. Fakes also hide EF Core translation bugs that only real PostgreSQL catches.

## Decision

- Test persistence and query behaviour against real PostgreSQL, not fakes.
- **Testcontainers for .NET orchestrates the database** (the `Testcontainers.PostgreSql` package).
  - The generated fixture starts one PostgreSQL container per test run. The container uses the same major version as dev and uat. An assembly- or collection-level fixture shares it.
  - The fixture applies the migrations once to a template database. Each test gets its own database cloned from that template (CLA-0019).
  - The container is removed when the run ends.
  - There is no connection-string variable to set, so nothing to forget.
- **No Docker means a failure, not a skip.** If the fixture cannot start a container, the database tests fail with a message that says Docker is needed. This applies locally and in CI.
- **Skips are tracked.** `Skip` needs a tracked reason.

## Consequences

- A green run means the database tests ran.
- `dotnet test` works the same on a developer machine and in CI, if Docker is running. CI no longer needs its own PostgreSQL service for the backend tests, because the containerised runners provide Docker.
