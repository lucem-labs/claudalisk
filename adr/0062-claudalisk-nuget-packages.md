# CLA-0062: Reusable backend infrastructure ships as claudalisk NuGet packages

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** the packages' own CI; reviewer
- **Issue:** #34

## Decision

- Infrastructure that every app needs, and that has no business meaning, is built, tested and versioned in the claudalisk repository as NuGet packages. Apps reference the packages and do not copy the code:
  - `Claudalisk.Dispatching.Abstractions`: commands, queries and handler interfaces, the only package that Interfaces projects may reference (CLA-0003);
  - `Claudalisk.Dispatching`: the dispatcher and its pipeline (CLA-0049);
  - `Claudalisk.Jobs`: jobs, workers, batch jobs and the jobs router (CLA-0058, CLA-0059, CLA-0060);
  - `Claudalisk.Jobs.PostgreSql`: the PostgreSQL transport, and later `Claudalisk.Jobs.Sqs` for AWS SQS;
  - `Claudalisk.Scheduling`: the scheduler module (CLA-0061).
- An app pins exact package versions. A fix reaches an app as a version bump in a normal pull request.
- Each package has its own tests, including Testcontainers tests against real PostgreSQL (CLA-0018). The claudalisk CI runs them.

## Consequences

- One implementation of the dispatcher, jobs and scheduler serves every app.
- An app cannot change the packages' behaviour by editing their code. It adds pipeline steps or options, or lists a deviation in its `AGENTS.md` (CLA-0028).
- Where the packages are published, and their exact names, are decided in #34.
