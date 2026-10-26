# CLA-0063: Domain errors are `DomainException`s, and one API-wide handler turns every error into Problem Details

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** architecture tests (no exception filters or `ProblemDetails` construction in modules); integration tests (each problem `type` and status); reviewer

## Context

An exception filter for each module, each a long `switch` from error codes to a status and a title, repeats the same mapping in every module. Exceptions must reach the unit of work so that it rolls back (CLA-0007), so errors stay exceptions and do not become result types.

## Decision

- **Domain errors are subclasses of `DomainException`** from the `Claudalisk.Domain` package (CLA-0062). Aggregates and handlers throw them.
- **Each domain error carries:**
  - a problem slug in the module's language, such as `already-shipped`;
  - a title that the UI can show as it is;
  - a kind: `Conflict` (409), `NotFound` (404) or `Forbidden` (403);
  - optional extension members, such as the number of items still available.
- **One `IExceptionHandler` turns every error into Problem Details** (CLA-0045), using ASP.NET Core's `AddProblemDetails`. It comes from the claudalisk web package, not from `Claudalisk.Domain`, because Domain projects never reference ASP.NET Core (CLA-0048). The Host registers it (CLA-0001):
  - a `DomainException` becomes its kind's status with `type: /problems/<module>/<slug>`;
  - a validation failure from the pipeline becomes `400` `ValidationProblemDetails` (CLA-0057);
  - an EF Core concurrency failure becomes `412` (CLA-0056);
  - any other exception becomes `500` with no internal details in the response.
- Modules write no exception filters and never build `ProblemDetails` themselves.
- Every problem `type` is listed in the OpenAPI document (CLA-0046), so the frontend can branch on it.

## Consequences

- Adding a domain error is one class in the module. No mapping code changes.
- Every module's errors have the same shape and the same `type` format.
- The unit of work rolls back on every domain error, because the exception propagates until the handler catches it.
