# CLA-0063: Domain errors are `DomainException`s, and one API-wide handler turns every error into Problem Details

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** architecture tests (no exception filters or `ProblemDetails` construction in modules); API tests (each problem `type` and status, and the `503` with `Retry-After` for an unavailable dependency, CLA-0070); reviewer

## Context

An exception filter for each module, each a long `switch` from error codes to a status and a title, repeats the same mapping in every module. Exceptions must reach the unit of work so that it rolls back (CLA-0007), so errors stay exceptions and do not become result types.

A third-party outage once had to be mapped to `409`, because the domain error kinds had nothing closer, although `503` is the honest status. An outage is not a rule of the domain: the same request succeeds once the dependency is back.

## Decision

- **Domain errors are subclasses of `DomainException`** from the `Claudalisk.Domain` package (CLA-0062). Aggregates and handlers throw them.
- **Each domain error carries:**
  - a problem slug in the module's language, such as `already-shipped`;
  - a title that the UI can show as it is;
  - a kind (`DomainErrorKind`): `Conflict` (409), `NotFound` (404) or `Forbidden` (403);
  - optional extension members, such as the number of items still available.
- **A third-party outage is not a domain error.** The module's client for the third-party API throws `DependencyUnavailableException` from the claudalisk libraries (CLA-0062), not a `DomainException` subclass. It can carry how long to wait, such as the third party's own `Retry-After`. `DomainErrorKind` has no `Unavailable` kind.
- **One `IExceptionHandler` turns every error into Problem Details** (CLA-0045), using ASP.NET Core's `AddProblemDetails`. It comes from the claudalisk web package, not from `Claudalisk.Domain`, because Domain projects never reference ASP.NET Core (CLA-0048). The Host registers it (CLA-0001):
  - a `DomainException` becomes its kind's status with `type: /problems/<module>/<slug>`;
  - a validation failure from the pipeline becomes `400` `ValidationProblemDetails` (CLA-0057);
  - a stale `If-Match` becomes `412` and a missing one `428`, and a lost race that is still lost when the retries run out becomes the dispatching package's `409` problem type (CLA-0056);
  - a `DependencyUnavailableException` becomes `503` with the web package's problem type and a `Retry-After` header;
  - any other exception becomes `500` with no internal details in the response.
- Modules write no exception filters and never build `ProblemDetails` themselves.
- Every problem `type` is listed in the OpenAPI document (CLA-0046), so the frontend can branch on it.

## Consequences

- Adding a domain error is one class in the module. No mapping code changes.
- Every module's errors have the same shape and the same `type` format.
- The unit of work rolls back on every domain error, because the exception propagates until the handler catches it.
- A client sees an outage as `503` and can try again after `Retry-After`. A job retries it with backoff, but fails at once on a domain error (CLA-0058).
