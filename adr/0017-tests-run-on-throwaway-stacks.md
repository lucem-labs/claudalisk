# CLA-0017: Tests run on throwaway stacks

- **Status:** accepted
- **Date:** 2026-10-24
- **Area:** testing
- **Enforced by:** CI configuration; reviewer

## Decision

- Each test run starts its own PostgreSQL. End-to-end tests also start their own API and web servers. Backend tests start PostgreSQL through Testcontainers (CLA-0018, proposed).
- Tests and CI never use the dev or uat Compose projects, databases or volumes.

## Consequences

- Tests can run anywhere, in parallel with each other and with the environments.
