# CLA-0018: Tests run on throwaway stacks with real PostgreSQL, and never skip silently

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** testing
- **Enforced by:** generated test fixture; CI configuration; reviewer
- **Issue:** #10

## Context

Real-database tests that skip themselves when a connection variable is unset let a local `dotnet test` pass with every such test skipped. Fakes also hide EF Core translation bugs that only real PostgreSQL catches. Tests that share the dev or uat database collide with the environments and with each other.

## Decision

- **Each test run starts its own stack.** It starts its own PostgreSQL. End-to-end tests also start their own API and web servers. Tests and CI never use the dev or uat Compose projects, databases or volumes.
- **Test persistence and query behaviour against real PostgreSQL**, not fakes.
- **Testcontainers for .NET starts the database** (the `Testcontainers.PostgreSql` package).
  - The generated fixture starts one PostgreSQL container per test run, on the same major version as dev and uat. An assembly- or collection-level fixture shares it.
  - The fixture applies the migrations once to a template database, and each test gets its own database cloned from it (CLA-0019).
  - The container is removed when the run ends.
  - There is no connection-string variable to set, so nothing to forget.
- **No Docker means a failure, not a skip.** If the fixture cannot start a container, the database tests fail with a message that says Docker is needed, locally and in CI.
- **Skips are tracked.** `Skip` needs a tracked reason.

## Consequences

- A green run means the database tests ran.
- Tests can run anywhere, in parallel with each other and with the environments.
- `dotnet test` works the same on a developer machine and in CI, if Docker is running. CI needs no PostgreSQL service for the backend tests, because the containerised runners provide Docker.
