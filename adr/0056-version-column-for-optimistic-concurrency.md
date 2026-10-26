# CLA-0056: Every aggregate root table has a version column for optimistic concurrency

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** data-and-migrations
- **Enforced by:** architecture tests (every aggregate root entity maps a `version` concurrency token); Feature tests (a stale save fails) and API tests (`412` and `428`) (CLA-0070)

## Context

Writes are conditional on the aggregate's version (CLA-0045), so two browser tabs cannot overwrite each other. PostgreSQL's `xmin` changes only when its own row changes. A command that changes only child rows, such as adding an order line, leaves the root row's `xmin` unchanged, so `xmin` cannot stand for the aggregate's version.

## Decision

- **Every table that holds an aggregate root has a `version` column** of type `bigint`, not null, starting at 1. Under CLA-0051 its name is `version`.
- **The store increments `version` on every save of the aggregate**, including a save that changes only child rows. It sets the root row as modified so that EF Core writes it.
- **`version` is the EF Core concurrency token.** EF Core adds `WHERE version = @original` to the update. A stale save raises `DbUpdateConcurrencyException`, which the API returns as `412 Precondition Failed` (CLA-0045).
- **The ETag is the version.** A response for an aggregate has a strong `ETag` such as `"7"`, and its representation has a `version` member, so that a client can send `If-Match` for an item it saw in a collection.
- **Every write to an existing aggregate needs `If-Match`:** `PUT`, `PATCH`, `DELETE` and commands. Creating an aggregate does not.
- Tables of child entities and read models have no `version` column. Their changes count as changes to their aggregate.

## Consequences

- One rule covers every resource, so the frontend handles `412` and `428` the same way everywhere.
- A command sent from a list view has the version it needs without another `GET`.
- The aggregate's version is a plain value in the Domain project (CLA-0048), so domain tests can check it without a database.
- A table created before this rule gets the column in a migration of its own.
