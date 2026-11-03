# CLA-0056: Every aggregate root table has a version column for optimistic concurrency

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** data-and-migrations
- **Enforced by:** architecture tests (every aggregate root's `<Aggregate>Entity`, CLA-0052, maps a `version` concurrency token); Feature tests (a stale save fails, a lost race re-runs the command, each exempt command succeeds without `If-Match`) and API tests (`412`, `428`, the `409` when the attempts run out, the `ETag` and `version` on every response) (CLA-0070)

## Context

Writes are conditional on the aggregate's version (CLA-0045), so two browser tabs cannot overwrite each other. PostgreSQL's `xmin` changes only when its own row changes. A command that changes only child rows, such as adding an order line, leaves the root row's `xmin` unchanged, so `xmin` cannot stand for the aggregate's version.

Two different failures look alike. A client that sends a version it read earlier, after someone else changed the aggregate, has acted on stale data, and only the client can decide what to do next. Two commands that both start from the current version and race to save have done nothing wrong, and the loser can simply run again on the new state. Some commands, such as appending an entry, apply to any state, so a version check only makes them fail for no reason.

## Decision

- **Every table that holds an aggregate root has a `version` column** of type `bigint`, not null, starting at 1. Under CLA-0051 its name is `version`.
- **The store increments `version` on every save of the aggregate**, including a save that changes only child rows. It sets the root row as modified so that EF Core writes it.
- **`version` is the EF Core concurrency token.** EF Core adds `WHERE version = @original` to the update, so a save that lost a race raises `DbUpdateConcurrencyException`.
- **The ETag is the version.** A response for an aggregate has a strong `ETag` such as `"7"`, and its representation has a `version` member, so that a client can send `If-Match` for an item it saw in a collection.
- **Every response that changes or returns an existing aggregate carries its new version,** as the `ETag` and as `version`. A command on a child entity returns the root's version.
- **Which writes need `If-Match`.** `PUT`, `PATCH`, `DELETE` and every command whose outcome depends on what the client read need it. A missing `If-Match` gets `428`. Creating an aggregate does not need it. A command that applies to any state, such as an append or a record, is declared exempt one command at a time, has a test that it succeeds without `If-Match`, and shows `If-Match` as optional in the OpenAPI document (CLA-0046).
- **A stale `If-Match` is refused at once** with `412 Precondition Failed` (CLA-0045) and is never retried.
- **A lost race re-runs the whole command.** A version conflict on save, a unique-key race, a serialization failure or a deadlock re-runs the command in a new unit of work, a bounded number of times. Each attempt loads the aggregate again and checks `If-Match` again, so a race lost to a change the client never saw ends in `412`. When the attempts run out, the command fails with a `409` problem type from the dispatching package (CLA-0062). A command sent inside another unit of work is not retried, because its transaction belongs to the caller, whose own retry re-runs it. The back-off (capped exponential, full jitter) and the number of attempts belong to the dispatching package, not this ADR.
- **A singleton child resource at a fixed URL,** such as `/orders/{id}/invoice`, is created with `POST`, which returns `201`, or `409` when it already exists. It is changed with `PUT` and removed with `DELETE`, both under `If-Match`. `_actions` offers whichever of these applies (CLA-0044).
- Tables of child entities and read models have no `version` column. Their changes count as changes to their aggregate.

## Consequences

- One rule covers every resource, so the frontend handles `412` and `428` the same way everywhere: `412` means reload and decide again.
- Two commands that race on the current version both succeed without the client seeing it, and an exempt command never fails because someone else wrote first.
- A command sent from a list view has the version it needs without another `GET`, and the version in each response is the one to send next.
- The aggregate's version is a plain value in the Domain project (CLA-0048), so domain tests can check it without a database.
- A table created before this rule gets the column in a migration of its own.
