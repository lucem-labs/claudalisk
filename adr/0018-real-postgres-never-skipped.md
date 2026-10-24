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
- The generated fixture uses a configured server, or else starts a container.
- The fixture fails, rather than skips, under CI or the Stop gate when it can't get a database.
- `Skip` needs a tracked reason.

## Consequences

- A green run means the database tests actually ran.
