# CLA-0045: The API uses HTTP's own semantics: status codes, Problem Details and conditional writes

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** reviewer; integration tests

## Decision

- **Success:**
  - `200` with the representation for a read, and for a write that returns the changed resource.
  - `201 Created` with a `Location` header for a new resource.
  - `202 Accepted` with a `Location` header that points to a job resource for queued work (CLA-0001, CLA-0043, CLA-0060). The job resource has its own state and a link to the result when there is one.
  - `204 No Content` for a write with nothing to return.
- **Failure:**
  - `400` for a request that fails validation, as ASP.NET Core's `ValidationProblemDetails`.
  - `404` for a resource that does not exist.
  - `409 Conflict` when the aggregate refuses a command or an edit because of a domain rule.
  - `412 Precondition Failed` when `If-Match` does not match the current version.
  - `428 Precondition Required` when a write that needs `If-Match` does not send it.
- **Every error is [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) Problem Details.** Each domain error has its own `type` URI in the module's language, such as `/problems/orders/already-shipped`. It also has a `title` and a `detail` that the UI can show as is. The frontend branches on `type`, never on the text.
- One API-wide exception handler turns every error into Problem Details (CLA-0063). Modules and controller actions do not do it.
- **Writes are conditional.** A `GET` of an aggregate returns an `ETag` built from its version (CLA-0048, CLA-0056). `PUT`, `PATCH`, `DELETE` and commands on an existing aggregate require `If-Match`. A stale version gets `412`, and the client reloads before it tries again.
- Methods keep their HTTP meaning. `GET` changes nothing. `PUT` and `DELETE` are idempotent. `POST` creates resources and sends commands.

## Consequences

- Two browser tabs cannot silently overwrite each other's changes.
- The frontend handles errors the same way everywhere, and tests can check each domain error by its `type`.
- Queued work and its progress are ordinary resources that TanStack Query can poll (CLA-0038).
