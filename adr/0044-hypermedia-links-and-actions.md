# CLA-0044: Representations carry links and the commands available now; the UI shows only those

- **Status:** accepted
- **Date:** 2026-10-25
- **Area:** backend-architecture
- **Enforced by:** reviewer; end-to-end tests

## Context

The UI never re-implements business rules (CLA-0015). Without hypermedia, it still has to decide which buttons to show, such as whether an order can still be cancelled. That decision is a business rule. *RESTful Web APIs* solves this with hypermedia: the server tells the client what it can do next.

## Decision

- Every resource representation has two extra members. Each item in a collection page has them too, because the page loads its aggregates (CLA-0047):
  - **`_links`**, in the HAL style: a map from link relation to `{ "href": "…" }`. It always has `self`. Collections have `next` and `prev` when more pages exist, and items link to their `collection`. Relation names are [IANA-registered](https://www.iana.org/assignments/link-relations/link-relations.xhtml) where one fits. Otherwise they use a word from the module's ubiquitous language.
  - **`_actions`**: a map from command name to `{ "href": "…", "method": "…" }`. It lists only the commands (CLA-0043) and edits that the aggregate allows right now. It does not list a command that the aggregate would refuse.
- The aggregate decides what goes in `_actions`, through the same rules that run when a client posts the command. A controller never decides it.

```json
{
  "id": "6a1f0c2e-7b1d-4c4e-9a53-2f1e8d0b9c11",
  "status": "placed",
  "_links": {
    "self": { "href": "/api/orders/6a1f0c2e-7b1d-4c4e-9a53-2f1e8d0b9c11" },
    "collection": { "href": "/api/orders" },
    "summary": { "href": "/api/orders/6a1f0c2e-7b1d-4c4e-9a53-2f1e8d0b9c11/summary" }
  },
  "_actions": {
    "cancel": { "href": "/api/orders/6a1f0c2e-7b1d-4c4e-9a53-2f1e8d0b9c11/cancel", "method": "POST" },
    "edit": { "href": "/api/orders/6a1f0c2e-7b1d-4c4e-9a53-2f1e8d0b9c11", "method": "PATCH" }
  }
}
```

- **The frontend follows the controls.** It shows a button or form only when its action is in `_actions`, and it calls the action's `href` with its `method`. It follows `next` and `prev` to page. It builds a URL itself only for the entry points of a page, such as a collection or a resource by id from the route.

## Consequences

- The aggregate answers "Can the user do this now?" once, so the UI cannot disagree with the server.
- An end-to-end test that checks that a button is hidden checks a server rule, which a backend test also covers.
- Adding a command or link is a backward-compatible change (CLA-0041).
- Representations are slightly larger, and every resource needs a way to build its links. That code lives in the module's mapping extension methods (CLA-0005).
