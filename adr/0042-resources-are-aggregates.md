# CLA-0042: Resources are aggregates, and read models are their own resources

- **Status:** proposed
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** reviewer

## Decision

- **An aggregate root is a resource.** It has one URL in its module's language, such as `/api/orders/{id}`, and its collection is `/api/orders`.
- **Child entities live under their root.** Clients reach an entity inside an aggregate only through the root, such as `/api/orders/{id}/lines/{lineId}`. It never gets a top-level URL, and only its root changes it.
- **Plain edits use `PUT` or `PATCH`.** They change attributes that have no rules of their own, such as a name or a note. A change that has rules or meaning in the domain is a command (CLA-0043).
- **Read models are resources too.** A view the domain computes, such as a summary, a projection or a report, is its own `GET` resource, such as `/api/orders/{id}/summary`. It is read-only and has a name in the domain's language.
- **Collections page through links.** A collection returns a page of items with `next` and `prev` links (CLA-0044). Clients page by following the links, never by computing offsets.
- Data a form needs before it can create something, such as defaults, is a `GET` resource of the collection it belongs to, such as `/api/orders/defaults`.

## Consequences

- The API's shape follows the consistency boundaries of the aggregates, so a write never has to touch two resources to keep a rule.
- Reads that need computed data do not bend the aggregate's representation to fit a screen.
- A rule that review finds enforced through a `PATCH` becomes a command.
